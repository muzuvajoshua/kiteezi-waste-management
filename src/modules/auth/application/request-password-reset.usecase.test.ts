import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InMemoryIdentityRepository } from '../infrastructure/in-memory-identity-repository.adapter';
import { InMemoryPasswordResetTokenRepository } from '../infrastructure/in-memory-password-reset-token-repository.adapter';
import { InMemoryEmailSender } from '@/shared/infrastructure/email/in-memory-email-sender.adapter';
import { Sha256ResetTokenService } from '../infrastructure/sha256-reset-token.adapter';
import { requestPasswordReset } from './request-password-reset.usecase';

// Requesting a reset link.
//
// The governing rule is that the response NEVER reveals whether an address is
// registered. A "no such account" reply turns this form into the account
// enumerator that sign-in was carefully built not to be — and this form is
// unauthenticated, so it is the easier of the two to probe.

const RESET_URL_BASE = 'https://kiteezi.example/reset-password';

function setup() {
  return {
    identityRepository: new InMemoryIdentityRepository(),
    tokenRepository: new InMemoryPasswordResetTokenRepository(),
    emailSender: new InMemoryEmailSender(),
    tokenService: new Sha256ResetTokenService(),
  };
}

type Deps = ReturnType<typeof setup>;

function run(deps: Deps, email: string) {
  return requestPasswordReset(
    deps.identityRepository,
    deps.tokenRepository,
    deps.emailSender,
    deps.tokenService,
    { email, resetUrlBase: RESET_URL_BASE }
  );
}

async function withAccount(email = 'citizen@example.com') {
  const deps = setup();
  await deps.identityRepository.link({
    userId: 7,
    provider: 'password',
    providerSubject: email,
    passwordHash: 'stored-hash',
  });
  return deps;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('requestPasswordReset', () => {
  describe('a registered address', () => {
    it('succeeds', async () => {
      const deps = await withAccount();

      expect(await run(deps, 'citizen@example.com')).toMatchObject({ ok: true });
    });

    it('emails the address a link carrying the token', async () => {
      const deps = await withAccount();

      await run(deps, 'citizen@example.com');

      const message = deps.emailSender.lastMessage;
      expect(message?.to).toBe('citizen@example.com');
      expect(message?.text).toContain(RESET_URL_BASE);
    });

    it('stores only the HASH of the emailed token', async () => {
      // A database leak must not yield working reset links.
      const deps = await withAccount();

      await run(deps, 'citizen@example.com');

      const token = deps.emailSender.lastMessage!.text.split('token=')[1].split(/\s/)[0];
      expect(await deps.tokenRepository.findByTokenHash(token)).toBeNull();
      expect(
        await deps.tokenRepository.findByTokenHash(deps.tokenService.hash(token))
      ).not.toBeNull();
    });

    it('issues a token that expires', async () => {
      const deps = await withAccount();

      await run(deps, 'citizen@example.com');

      const token = deps.emailSender.lastMessage!.text.split('token=')[1].split(/\s/)[0];
      const stored = await deps.tokenRepository.findByTokenHash(deps.tokenService.hash(token));
      expect(stored!.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('matches the address regardless of casing', async () => {
      const deps = await withAccount();

      await run(deps, '  Citizen@EXAMPLE.com ');

      expect(deps.emailSender.sent).toHaveLength(1);
    });

    it('issues a different token each time', async () => {
      const deps = await withAccount();

      await run(deps, 'citizen@example.com');
      await run(deps, 'citizen@example.com');

      expect(deps.emailSender.sent[0].text).not.toBe(deps.emailSender.sent[1].text);
    });
  });

  describe('an address with no password account', () => {
    it('returns the SAME success response, so the form cannot enumerate accounts', async () => {
      const deps = await withAccount();

      const known = await run(deps, 'citizen@example.com');
      const unknown = await run(deps, 'nobody@example.com');

      expect(unknown).toEqual(known);
    });

    it('sends no email', async () => {
      const deps = await withAccount();

      await run(deps, 'nobody@example.com');

      expect(deps.emailSender.sent).toHaveLength(0);
    });

    it('creates no token', async () => {
      const deps = await withAccount();

      await run(deps, 'nobody@example.com');

      expect(await deps.tokenRepository.findByTokenHash('anything')).toBeNull();
    });

    it('does not offer a reset to a Google-only account', async () => {
      // There is no password to reset, and emailing a link would imply one
      // exists. The account is reachable through Google, which still works.
      const deps = setup();
      await deps.identityRepository.link({
        userId: 9,
        provider: 'google',
        providerSubject: 'google-sub-9',
      });

      const result = await run(deps, 'google-user@example.com');

      expect(result).toMatchObject({ ok: true });
      expect(deps.emailSender.sent).toHaveLength(0);
    });
  });

  describe('when the email fails to send', () => {
    it('still reports success, because failing loudly would leak existence', async () => {
      // An error here is only reachable for a REGISTERED address, so
      // surfacing it would say "this account exists" — exactly what the
      // identical-response rule exists to prevent.
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const deps = await withAccount();
      deps.emailSender.failWith(new Error('provider down'));

      expect(await run(deps, 'citizen@example.com')).toMatchObject({ ok: true });
    });

    it('logs the failure server-side so it is not silent', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const deps = await withAccount();
      deps.emailSender.failWith(new Error('provider down'));

      await run(deps, 'citizen@example.com');

      expect(spy).toHaveBeenCalled();
    });
  });
});
