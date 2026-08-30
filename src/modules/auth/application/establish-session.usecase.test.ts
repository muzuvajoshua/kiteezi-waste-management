import { describe, it, expect } from 'vitest';
import { InMemorySessionRepository } from '../infrastructure/in-memory-session-repository.adapter';
import { InMemorySessionStore } from '../infrastructure/in-memory-session-store.adapter';
import { InMemorySessionTokenService } from '../infrastructure/in-memory-session-token-service.adapter';
import { InMemoryUserRepository } from '../infrastructure/in-memory-user-repository.adapter';
import { InMemoryRoleRepository } from '../infrastructure/in-memory-role-repository.adapter';
import { InMemoryIdentityRepository } from '../infrastructure/in-memory-identity-repository.adapter';
import { InMemoryIdentityProvider } from '../infrastructure/in-memory-identity-provider.adapter';
import { establishSession } from './establish-session.usecase';

function setup() {
  return {
    identityProvider: new InMemoryIdentityProvider(),
    identityRepository: new InMemoryIdentityRepository(),
    userRepository: new InMemoryUserRepository(),
    roleRepository: new InMemoryRoleRepository(),
    sessionTokenService: new InMemorySessionTokenService(),
    sessionStore: new InMemorySessionStore(),
    sessionRepository: new InMemorySessionRepository(),
  };
}

type Deps = ReturnType<typeof setup>;

function run(deps: Deps, idToken: string) {
  return establishSession(
    deps.identityProvider,
    deps.identityRepository,
    deps.userRepository,
    deps.roleRepository,
    deps.sessionTokenService,
    deps.sessionStore,
    deps.sessionRepository,
    { idToken }
  );
}

describe('establishSession', () => {
  describe('first sign-in', () => {
    it('creates the user, links the identity, assigns citizen and stores a session', async () => {
      const deps = setup();
      deps.identityProvider.seedToken('tok-1', {
        subject: 'google-sub-1',
        email: 'new@example.com',
        emailVerified: true,
        name: 'New Person',
      });

      const result = await run(deps, 'tok-1');

      expect(result).toEqual({
        ok: true,
        value: { id: 1, email: 'new@example.com', name: 'New Person' },
      });
      expect(await deps.roleRepository.getUserRoles(1)).toEqual(['citizen']);
      expect(await deps.sessionStore.get()).not.toBeNull();
      // The identity is what a later sign-in resolves by.
      expect(await deps.identityRepository.findByProviderSubject('google', 'google-sub-1')).toEqual(
        expect.objectContaining({ userId: 1, provider: 'google' })
      );
    });

    it('defaults the name when the token carries none', async () => {
      const deps = setup();
      deps.identityProvider.seedToken('tok-2', {
        subject: 'google-sub-2',
        email: 'noname@example.com',
        emailVerified: true,
      });

      const result = await run(deps, 'tok-2');

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.name).toBe('Anonymous User');
    });
  });

  describe('returning sign-in resolves by subject, not email', () => {
    it('reuses the linked user without re-assigning a role', async () => {
      const deps = setup();
      deps.userRepository.seed({ id: 5, email: 'existing@example.com', name: 'Existing' });
      deps.roleRepository.seedRoles(5, ['admin']);
      await deps.identityRepository.link({
        userId: 5,
        provider: 'google',
        providerSubject: 'google-sub-5',
      });
      deps.identityProvider.seedToken('tok-3', {
        subject: 'google-sub-5',
        email: 'existing@example.com',
        emailVerified: true,
      });

      const result = await run(deps, 'tok-3');

      expect(result).toEqual({
        ok: true,
        value: { id: 5, email: 'existing@example.com', name: 'Existing' },
      });
      expect(await deps.roleRepository.getUserRoles(5)).toEqual(['admin']); // not re-granted
      // A returning user must get a session too — the branch that resolves an
      // existing identity is easy to write without minting one.
      expect(await deps.sessionStore.get()).not.toBeNull();
    });

    it('still resolves the same user after their email address changed', async () => {
      // The whole point of keying on subject: Google's `sub` is immutable, so
      // a changed address must not orphan the account or create a second one.
      const deps = setup();
      deps.userRepository.seed({ id: 6, email: 'old@example.com', name: 'Renamed Person' });
      await deps.identityRepository.link({
        userId: 6,
        provider: 'google',
        providerSubject: 'google-sub-6',
      });
      deps.identityProvider.seedToken('tok-4', {
        subject: 'google-sub-6',
        email: 'new-address@example.com',
        emailVerified: true,
      });

      const result = await run(deps, 'tok-4');

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.id).toBe(6);
      expect(deps.userRepository.count()).toBe(1); // no duplicate account
      expect(await deps.sessionStore.get()).not.toBeNull();
    });
  });

  describe('account takeover is not possible via the email claim', () => {
    it('does NOT adopt an existing account when a different subject presents its email', async () => {
      // The vulnerability this use-case was rewritten to remove. Under the old
      // email-keyed logic, any token bearing a known address resolved to that
      // account. Now a new subject is a new identity, even on a matching email.
      const deps = setup();
      deps.userRepository.seed({ id: 9, email: 'victim@example.com', name: 'Victim' });
      deps.roleRepository.seedRoles(9, ['admin']);
      await deps.identityRepository.link({
        userId: 9,
        provider: 'google',
        providerSubject: 'google-sub-victim',
      });
      deps.identityProvider.seedToken('attacker', {
        subject: 'google-sub-attacker',
        email: 'victim@example.com',
        emailVerified: true,
      });

      const result = await run(deps, 'attacker');

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('CONFLICT');
      // The victim's identity is untouched and still points at them.
      expect(
        await deps.identityRepository.findByProviderSubject('google', 'google-sub-victim')
      ).toEqual(expect.objectContaining({ userId: 9 }));
    });

    it('rejects an unverified email on first sign-in rather than trusting it', async () => {
      const deps = setup();
      deps.identityProvider.seedToken('unverified', {
        subject: 'google-sub-unverified',
        email: 'someone@example.com',
        emailVerified: false,
      });

      const result = await run(deps, 'unverified');

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('UNAUTHENTICATED');
      expect(deps.userRepository.count()).toBe(0);
    });
  });

  describe('rejects unusable credentials', () => {
    it('maps an invalid token to UNAUTHENTICATED', async () => {
      const deps = setup();

      const result = await run(deps, 'unknown-token');

      expect(result).toEqual({
        ok: false,
        error: { code: 'UNAUTHENTICATED', message: 'Invalid token' },
      });
    });

    it('maps a token with no email claim to UNAUTHENTICATED', async () => {
      const deps = setup();
      deps.identityProvider.seedToken('tok-5', { subject: 'google-sub-7', name: 'No Email' });

      const result = await run(deps, 'tok-5');

      expect(result).toEqual({
        ok: false,
        error: { code: 'UNAUTHENTICATED', message: 'Token has no email claim' },
      });
    });

    it('does not store a session when sign-in fails', async () => {
      const deps = setup();

      await run(deps, 'unknown-token');

      expect(await deps.sessionStore.get()).toBeNull();
    });
  });
});
