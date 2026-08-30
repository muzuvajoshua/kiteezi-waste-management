import { describe, it, expect } from 'vitest';
import { InMemorySessionStore } from '../infrastructure/in-memory-session-store.adapter';
import { InMemorySessionTokenService } from '../infrastructure/in-memory-session-token-service.adapter';
import { InMemoryUserRepository } from '../infrastructure/in-memory-user-repository.adapter';
import { InMemoryRoleRepository } from '../infrastructure/in-memory-role-repository.adapter';
import { InMemoryIdentityRepository } from '../infrastructure/in-memory-identity-repository.adapter';
import { ScryptPasswordHasher } from '../infrastructure/scrypt-password-hasher.adapter';
import { registerWithPassword } from './register-with-password.usecase';

// Registration runs against the REAL scrypt hasher, at deliberately low cost.
// A fake hasher would let a bug like "stored the password verbatim" pass, and
// that is precisely the bug worth catching here.
const hasher = new ScryptPasswordHasher({ N: 1024, r: 8, p: 1 });

function setup() {
  return {
    passwordHasher: hasher,
    identityRepository: new InMemoryIdentityRepository(),
    userRepository: new InMemoryUserRepository(),
    roleRepository: new InMemoryRoleRepository(),
    sessionTokenService: new InMemorySessionTokenService(),
    sessionStore: new InMemorySessionStore(),
  };
}

type Deps = ReturnType<typeof setup>;

function run(deps: Deps, input: { email: string; password: string; name?: string }) {
  return registerWithPassword(
    deps.passwordHasher,
    deps.identityRepository,
    deps.userRepository,
    deps.roleRepository,
    deps.sessionTokenService,
    deps.sessionStore,
    input
  );
}

describe('registerWithPassword', () => {
  describe('a new account', () => {
    it('creates the user, links a password identity, assigns citizen and signs them in', async () => {
      const deps = setup();

      const result = await run(deps, {
        email: 'citizen@example.com',
        password: 'correct horse battery staple',
        name: 'New Citizen',
      });

      expect(result).toEqual({
        ok: true,
        value: { id: 1, email: 'citizen@example.com', name: 'New Citizen' },
      });
      expect(await deps.roleRepository.getUserRoles(1)).toEqual(['citizen']);
      expect(await deps.sessionStore.get()).not.toBeNull();
    });

    it('stores a verifiable hash, never the password', async () => {
      const deps = setup();

      await run(deps, { email: 'citizen@example.com', password: 'correct horse battery staple' });

      const identity = await deps.identityRepository.findByProviderSubject(
        'password',
        'citizen@example.com'
      );
      expect(identity?.passwordHash).toBeTruthy();
      expect(identity?.passwordHash).not.toContain('correct horse battery staple');
      expect(await hasher.verify('correct horse battery staple', identity!.passwordHash!)).toBe(
        true
      );
    });

    it('defaults the name when none is given', async () => {
      const deps = setup();

      const result = await run(deps, {
        email: 'citizen@example.com',
        password: 'correct horse battery staple',
      });

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.name).toBe('Anonymous User');
    });

    it('keys the identity on the normalised address', async () => {
      // Otherwise 'Citizen@Example.com' and 'citizen@example.com' become two
      // accounts, and which one you reach depends on how you typed it.
      const deps = setup();

      await run(deps, {
        email: '  Citizen@Example.COM  ',
        password: 'correct horse battery staple',
      });

      expect(
        await deps.identityRepository.findByProviderSubject('password', 'citizen@example.com')
      ).not.toBeNull();
    });

    it('stores the normalised address on the user record', async () => {
      const deps = setup();

      const result = await run(deps, {
        email: 'Citizen@Example.COM',
        password: 'correct horse battery staple',
      });

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.email).toBe('citizen@example.com');
    });
  });

  describe('refuses to create a duplicate', () => {
    it('refuses when a password identity already exists for that address', async () => {
      const deps = setup();
      await run(deps, { email: 'citizen@example.com', password: 'correct horse battery staple' });

      const second = await run(deps, {
        email: 'citizen@example.com',
        password: 'a completely different password',
      });

      expect(second.ok).toBe(false);
      if (!second.ok) {
        expect(second.error.code).toBe('CONFLICT');
        // Asserts the message from the password-identity guard specifically,
        // not merely "some CONFLICT". The later email-owner guard also
        // returns CONFLICT here, so a code-only assertion passes even with
        // the first guard deleted — verified by mutation. The two messages
        // differ because the advice differs: this address already has a
        // password, so "add a password from settings" would be wrong.
        expect(second.error.message).toBe('An account already exists for this email address.');
      }
      expect(deps.userRepository.count()).toBe(1);
    });

    it('does not overwrite the existing password on a duplicate attempt', async () => {
      // The takeover this prevents: if registering over an existing address
      // replaced the hash, anyone could reset a stranger's password by
      // "registering" again.
      const deps = setup();
      await run(deps, { email: 'citizen@example.com', password: 'the original password' });

      await run(deps, { email: 'citizen@example.com', password: 'an attacker password' });

      const identity = await deps.identityRepository.findByProviderSubject(
        'password',
        'citizen@example.com'
      );
      expect(await hasher.verify('the original password', identity!.passwordHash!)).toBe(true);
      expect(await hasher.verify('an attacker password', identity!.passwordHash!)).toBe(false);
    });

    it('refuses when the address already belongs to a Google account', async () => {
      // Same reasoning as sign-in: linking a second method to an existing
      // account is a deliberate authenticated action, not something
      // registration infers from a matching address.
      const deps = setup();
      deps.userRepository.seed({ id: 3, email: 'citizen@example.com', name: 'Google Citizen' });

      const result = await run(deps, {
        email: 'citizen@example.com',
        password: 'correct horse battery staple',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('CONFLICT');
    });

    it('does not sign anyone in when registration is refused', async () => {
      const deps = setup();
      deps.userRepository.seed({ id: 3, email: 'citizen@example.com', name: 'Existing' });

      await run(deps, { email: 'citizen@example.com', password: 'correct horse battery staple' });

      expect(await deps.sessionStore.get()).toBeNull();
    });
  });

  describe('enforces the password policy', () => {
    it('rejects a password below the minimum length', async () => {
      const deps = setup();

      const result = await run(deps, { email: 'citizen@example.com', password: 'short' });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('VALIDATION');
        expect(result.error.domainCode).toBe('WEAK_PASSWORD');
      }
    });

    it('creates no user when the password is rejected', async () => {
      const deps = setup();

      await run(deps, { email: 'citizen@example.com', password: 'short' });

      expect(deps.userRepository.count()).toBe(0);
      expect(await deps.sessionStore.get()).toBeNull();
    });
  });
});
