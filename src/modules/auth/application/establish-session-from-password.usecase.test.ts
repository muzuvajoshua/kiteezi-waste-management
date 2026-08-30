import { describe, it, expect } from 'vitest';
import { InMemorySessionRepository } from '../infrastructure/in-memory-session-repository.adapter';
import { InMemorySessionStore } from '../infrastructure/in-memory-session-store.adapter';
import { InMemorySessionTokenService } from '../infrastructure/in-memory-session-token-service.adapter';
import { InMemoryUserRepository } from '../infrastructure/in-memory-user-repository.adapter';
import { InMemoryRoleRepository } from '../infrastructure/in-memory-role-repository.adapter';
import { InMemoryIdentityRepository } from '../infrastructure/in-memory-identity-repository.adapter';
import { ScryptPasswordHasher } from '../infrastructure/scrypt-password-hasher.adapter';
import { registerWithPassword } from './register-with-password.usecase';
import { establishSessionFromPassword } from './establish-session-from-password.usecase';

const hasher = new ScryptPasswordHasher({ N: 1024, r: 8, p: 1 });

function setup() {
  return {
    passwordHasher: hasher,
    identityRepository: new InMemoryIdentityRepository(),
    userRepository: new InMemoryUserRepository(),
    roleRepository: new InMemoryRoleRepository(),
    sessionTokenService: new InMemorySessionTokenService(),
    sessionStore: new InMemorySessionStore(),
    sessionRepository: new InMemorySessionRepository(),
  };
}

type Deps = ReturnType<typeof setup>;

async function withRegisteredUser(email = 'citizen@example.com', password = 'correct horse battery staple') {
  const deps = setup();
  await registerWithPassword(
    deps.passwordHasher,
    deps.identityRepository,
    deps.userRepository,
    deps.roleRepository,
    deps.sessionTokenService,
    deps.sessionStore,
    deps.sessionRepository,
    { email, password, name: 'Registered Citizen' }
  );
  await deps.sessionStore.clear(); // registration signs in; start these tests signed out
  return deps;
}

function signIn(deps: Deps, input: { email: string; password: string }) {
  return establishSessionFromPassword(
    deps.passwordHasher,
    deps.identityRepository,
    deps.userRepository,
    deps.sessionTokenService,
    deps.sessionStore,
    deps.sessionRepository,
    input
  );
}

describe('establishSessionFromPassword', () => {
  describe('correct credentials', () => {
    it('signs the user in', async () => {
      const deps = await withRegisteredUser();

      const result = await signIn(deps, {
        email: 'citizen@example.com',
        password: 'correct horse battery staple',
      });

      expect(result).toEqual({
        ok: true,
        value: { id: 1, email: 'citizen@example.com', name: 'Registered Citizen' },
      });
      expect(await deps.sessionStore.get()).not.toBeNull();
    });

    it('accepts the address in any casing', async () => {
      const deps = await withRegisteredUser();

      const result = await signIn(deps, {
        email: '  Citizen@Example.COM ',
        password: 'correct horse battery staple',
      });

      expect(result.ok).toBe(true);
    });
  });

  describe('wrong credentials are indistinguishable from each other', () => {
    it('rejects a wrong password', async () => {
      const deps = await withRegisteredUser();

      const result = await signIn(deps, {
        email: 'citizen@example.com',
        password: 'not the right password',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('UNAUTHENTICATED');
    });

    it('rejects an unknown address', async () => {
      const deps = await withRegisteredUser();

      const result = await signIn(deps, {
        email: 'nobody@example.com',
        password: 'correct horse battery staple',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('UNAUTHENTICATED');
    });

    it('returns the SAME message for both, so the response cannot enumerate accounts', async () => {
      const deps = await withRegisteredUser();

      const wrongPassword = await signIn(deps, {
        email: 'citizen@example.com',
        password: 'wrong',
      });
      const unknownUser = await signIn(deps, {
        email: 'nobody@example.com',
        password: 'wrong',
      });

      expect(wrongPassword.ok).toBe(false);
      expect(unknownUser.ok).toBe(false);
      if (wrongPassword.ok || unknownUser.ok) return;
      expect(wrongPassword.error).toEqual(unknownUser.error);
    });

    it('still hashes when the address is unknown, so timing cannot enumerate accounts either', async () => {
      // The message being identical is not enough: if an unknown address
      // returned immediately while a known one paid for a scrypt hash, the
      // response time alone would reveal which addresses are registered.
      const deps = await withRegisteredUser();
      let hashCalls = 0;
      const countingHasher = {
        hash: (p: string) => deps.passwordHasher.hash(p),
        verify: (p: string, h: string) => {
          hashCalls += 1;
          return deps.passwordHasher.verify(p, h);
        },
      };

      await establishSessionFromPassword(
        countingHasher,
        deps.identityRepository,
        deps.userRepository,
        deps.sessionTokenService,
        deps.sessionStore,
    deps.sessionRepository,
        { email: 'nobody@example.com', password: 'anything' }
      );

      expect(hashCalls).toBe(1);
    });

    it('stores no session for either failure', async () => {
      const deps = await withRegisteredUser();

      await signIn(deps, { email: 'citizen@example.com', password: 'wrong' });
      expect(await deps.sessionStore.get()).toBeNull();

      await signIn(deps, { email: 'nobody@example.com', password: 'wrong' });
      expect(await deps.sessionStore.get()).toBeNull();
    });
  });

  describe('an account with no password identity', () => {
    it('refuses a Google-only account rather than letting any password through', async () => {
      const deps = setup();
      deps.userRepository.seed({ id: 4, email: 'google@example.com', name: 'Google Only' });
      await deps.identityRepository.link({
        userId: 4,
        provider: 'google',
        providerSubject: 'google-sub-4',
      });

      const result = await signIn(deps, {
        email: 'google@example.com',
        password: 'any password at all',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('UNAUTHENTICATED');
      expect(await deps.sessionStore.get()).toBeNull();
    });
  });

  describe('a password identity whose user is missing', () => {
    it('reports an unexpected fault rather than signing in a ghost', async () => {
      const deps = setup();
      await deps.identityRepository.link({
        userId: 99,
        provider: 'password',
        providerSubject: 'orphan@example.com',
        passwordHash: await hasher.hash('correct horse battery staple'),
      });

      const result = await signIn(deps, {
        email: 'orphan@example.com',
        password: 'correct horse battery staple',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('UNEXPECTED');
      expect(await deps.sessionStore.get()).toBeNull();
    });
  });
});
