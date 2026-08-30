import { describe, it, expect } from 'vitest';
import { InMemoryIdentityRepository } from '../infrastructure/in-memory-identity-repository.adapter';
import { InMemoryPasswordResetTokenRepository } from '../infrastructure/in-memory-password-reset-token-repository.adapter';
import { Sha256ResetTokenService } from '../infrastructure/sha256-reset-token.adapter';
import { ScryptPasswordHasher } from '../infrastructure/scrypt-password-hasher.adapter';
import { InMemorySessionRepository } from '../infrastructure/in-memory-session-repository.adapter';
import { InMemorySessionStore } from '../infrastructure/in-memory-session-store.adapter';
import { InMemorySessionTokenService } from '../infrastructure/in-memory-session-token-service.adapter';
import { startSession } from './start-session';
import { resetPassword } from './reset-password.usecase';

// Consuming a reset link.
//
// Runs against the REAL scrypt hasher (at low cost) and the real token
// service: a fake hasher would let "stored the password verbatim" pass, and a
// fake token service would let a hashing mistake pass.

const hasher = new ScryptPasswordHasher({ N: 1024, r: 8, p: 1 });
const tokenService = new Sha256ResetTokenService();

async function setup() {
  const identityRepository = new InMemoryIdentityRepository();
  const tokenRepository = new InMemoryPasswordResetTokenRepository();
  await identityRepository.link({
    userId: 7,
    provider: 'password',
    providerSubject: 'citizen@example.com',
    passwordHash: await hasher.hash('the original password'),
  });
  return { identityRepository, tokenRepository, sessionRepository: new InMemorySessionRepository() };
}

type Deps = Awaited<ReturnType<typeof setup>>;

async function issueToken(deps: Deps, { expiresInMs = 3_600_000, userId = 7 } = {}) {
  const { token, tokenHash } = tokenService.generate();
  await deps.tokenRepository.create({
    userId,
    tokenHash,
    expiresAt: new Date(Date.now() + expiresInMs),
  });
  return token;
}

function run(deps: Deps, token: string, newPassword: string) {
  return resetPassword(
    deps.tokenRepository,
    deps.identityRepository,
    hasher,
    tokenService,
    deps.sessionRepository,
    { token, newPassword }
  );
}

async function storedHash(deps: Deps): Promise<string> {
  const identity = await deps.identityRepository.findByProviderSubject(
    'password',
    'citizen@example.com'
  );
  return identity!.passwordHash!;
}

describe('resetPassword', () => {
  describe('a valid token', () => {
    it('succeeds', async () => {
      const deps = await setup();
      const token = await issueToken(deps);

      expect(await run(deps, token, 'a brand new password')).toMatchObject({ ok: true });
    });

    it('ends every existing session, so the old password buys no more access', async () => {
      // The reason KWM-079 was done before this: without it a reset protects
      // nobody, because whoever signed in with the old password simply stays
      // signed in for the life of their cookie.
      const deps = await setup();
      const store = new InMemorySessionStore();
      const tokens = new InMemorySessionTokenService();
      await startSession(tokens, store, deps.sessionRepository, 7);
      await startSession(tokens, store, deps.sessionRepository, 7);
      const token = await issueToken(deps);

      const result = await run(deps, token, 'a brand new password');

      expect(result).toMatchObject({ ok: true, value: { sessionsEnded: 2 } });
    });

    it('reports zero sessions ended when none were open', async () => {
      const deps = await setup();
      const token = await issueToken(deps);

      expect(await run(deps, token, 'a brand new password')).toMatchObject({
        ok: true,
        value: { sessionsEnded: 0 },
      });
    });

    it("does not end another user's sessions", async () => {
      const deps = await setup();
      const store = new InMemorySessionStore();
      const tokens = new InMemorySessionTokenService();
      await startSession(tokens, store, deps.sessionRepository, 8);
      const token = await issueToken(deps);

      await run(deps, token, 'a brand new password');

      const theirs = await deps.sessionRepository.revokeAllForUser(8);
      expect(theirs).toBe(1); // still live, so revoking now ends exactly one
    });

    it('replaces the stored password', async () => {
      const deps = await setup();
      const token = await issueToken(deps);

      await run(deps, token, 'a brand new password');

      expect(await hasher.verify('a brand new password', await storedHash(deps))).toBe(true);
    });

    it('stops the old password working', async () => {
      const deps = await setup();
      const token = await issueToken(deps);

      await run(deps, token, 'a brand new password');

      expect(await hasher.verify('the original password', await storedHash(deps))).toBe(false);
    });

    it('never stores the new password in the clear', async () => {
      const deps = await setup();
      const token = await issueToken(deps);

      await run(deps, token, 'a brand new password');

      expect(await storedHash(deps)).not.toContain('a brand new password');
    });
  });

  describe('a token can only be used once', () => {
    it('refuses the second use', async () => {
      // Without this a link stays live for its whole lifetime, so anyone who
      // later reads the mailbox — or a forwarded copy, or a proxy log — can
      // reset the password again.
      const deps = await setup();
      const token = await issueToken(deps);
      await run(deps, token, 'a brand new password');

      expect(await run(deps, token, 'an attacker password')).toMatchObject({ ok: false });
    });

    it('leaves the first reset intact after a replay', async () => {
      const deps = await setup();
      const token = await issueToken(deps);
      await run(deps, token, 'a brand new password');

      await run(deps, token, 'an attacker password');

      expect(await hasher.verify('a brand new password', await storedHash(deps))).toBe(true);
      expect(await hasher.verify('an attacker password', await storedHash(deps))).toBe(false);
    });

    it('invalidates every OTHER outstanding token for that user', async () => {
      // An attacker who requested a reset must not keep a live link after the
      // real owner changes the password.
      const deps = await setup();
      const attackerToken = await issueToken(deps);
      const ownerToken = await issueToken(deps);

      await run(deps, ownerToken, 'the owner password');

      expect(await run(deps, attackerToken, 'the attacker password')).toMatchObject({ ok: false });
      expect(await hasher.verify('the owner password', await storedHash(deps))).toBe(true);
    });
  });

  describe('a token that should not work', () => {
    it('refuses an expired token', async () => {
      const deps = await setup();
      const token = await issueToken(deps, { expiresInMs: -1000 });

      expect(await run(deps, token, 'a brand new password')).toMatchObject({ ok: false });
    });

    it('refuses an unknown token', async () => {
      const deps = await setup();

      expect(await run(deps, 'not-a-real-token', 'a brand new password')).toMatchObject({
        ok: false,
      });
    });

    it('refuses an empty token', async () => {
      const deps = await setup();

      expect(await run(deps, '', 'a brand new password')).toMatchObject({ ok: false });
    });

    it('reports every bad token identically, so probing reveals nothing', async () => {
      // Distinguishing expired from unknown from used tells an attacker
      // whether a guessed token ever existed.
      const deps = await setup();
      const expired = await issueToken(deps, { expiresInMs: -1000 });
      const used = await issueToken(deps);
      await run(deps, used, 'a brand new password');

      const a = await run(deps, expired, 'x'.repeat(12));
      const b = await run(deps, used, 'x'.repeat(12));
      const c = await run(deps, 'never-existed', 'x'.repeat(12));

      expect(a.ok).toBe(false);
      if (a.ok || b.ok || c.ok) return;
      expect(a.error).toEqual(b.error);
      expect(b.error).toEqual(c.error);
    });

    it('does not change the password when the token is refused', async () => {
      const deps = await setup();

      await run(deps, 'not-a-real-token', 'an attacker password');

      expect(await hasher.verify('the original password', await storedHash(deps))).toBe(true);
    });
  });

  describe('the new password must satisfy the policy', () => {
    it('refuses a password below the minimum length', async () => {
      const deps = await setup();
      const token = await issueToken(deps);

      const result = await run(deps, token, 'short');

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.domainCode).toBe('WEAK_PASSWORD');
    });

    it('leaves the token usable after a rejected password', async () => {
      // A weak attempt must not burn the link — the user is mid-flow and
      // should be able to try a better password.
      const deps = await setup();
      const token = await issueToken(deps);
      await run(deps, token, 'short');

      expect(await run(deps, token, 'a brand new password')).toMatchObject({ ok: true });
    });
  });

  describe('a token whose user is gone', () => {
    it('reports an unexpected fault rather than succeeding silently', async () => {
      const deps = await setup();
      const token = await issueToken(deps, { userId: 999 });

      const result = await run(deps, token, 'a brand new password');

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('UNEXPECTED');
    });
  });
});
