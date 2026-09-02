import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { sql } from 'drizzle-orm';
import { createTestDatabase, seedUsers, type TestDatabase } from '@/test-support/pglite-database';
import { DrizzleIdentityRepository } from './drizzle-identity-repository.adapter';

// KWM-063 — first coverage for this adapter.
//
// This table decides which account a sign-in lands on. The constraints on it
// are the security property, not the queries: unique(provider,
// provider_subject) is what stops two accounts claiming the same Google
// `sub`, and the CHECK is what stops a password hash existing on a
// federated identity. None of that is expressible in an in-memory fake,
// which is why these are written against a real database.

let database: TestDatabase;

beforeAll(async () => {
  database = await createTestDatabase();
}, 60_000);

beforeEach(async () => {
  await database.reset();
  await seedUsers(database.db);
});

afterAll(async () => {
  await database.close();
});

const repo = () => new DrizzleIdentityRepository(database.db);

describe('DrizzleIdentityRepository', () => {
  describe('lookup', () => {
    it('round-trips a linked google identity', async () => {
      await repo().link({ userId: 1, provider: 'google', providerSubject: 'sub-1' });

      expect(await repo().findByProviderSubject('google', 'sub-1')).toEqual({
        userId: 1,
        provider: 'google',
        providerSubject: 'sub-1',
        passwordHash: null,
      });
    });

    it('returns null for a subject nobody has linked', async () => {
      expect(await repo().findByProviderSubject('google', 'nobody')).toBeNull();
    });

    it('matches on provider as well as subject', async () => {
      // The same string can be a Google `sub` and a password identity's
      // email. Matching on subject alone would let one sign a caller in as
      // the other.
      await repo().link({ userId: 1, provider: 'google', providerSubject: 'shared' });
      await repo().link({
        userId: 2,
        provider: 'password',
        providerSubject: 'shared',
        passwordHash: 'scrypt$hash',
      });

      expect((await repo().findByProviderSubject('google', 'shared'))?.userId).toBe(1);
      expect((await repo().findByProviderSubject('password', 'shared'))?.userId).toBe(2);
    });

    it('returns the requested identity, not simply the first row', async () => {
      await repo().link({ userId: 1, provider: 'google', providerSubject: 'sub-1' });
      await repo().link({ userId: 2, provider: 'google', providerSubject: 'sub-2' });

      expect((await repo().findByProviderSubject('google', 'sub-2'))?.userId).toBe(2);
    });
  });

  describe('the constraints that make this safe', () => {
    it('refuses to give one provider subject to a second user', async () => {
      // The core guarantee. Without it, a race between two concurrent first
      // sign-ins for the same Google `sub` creates two accounts, and later
      // sign-ins land on whichever row is returned first.
      await repo().link({ userId: 1, provider: 'google', providerSubject: 'sub-1' });

      await expect(
        repo().link({ userId: 2, provider: 'google', providerSubject: 'sub-1' })
      ).rejects.toThrow(/unique|duplicate/i);
    });

    it('refuses a second identity with the same provider for one user', async () => {
      await repo().link({ userId: 1, provider: 'google', providerSubject: 'sub-1' });

      await expect(
        repo().link({ userId: 1, provider: 'google', providerSubject: 'sub-2' })
      ).rejects.toThrow(/unique|duplicate/i);
    });

    it('lets one user hold both a google and a password identity', async () => {
      // This is what makes "sign in either way" work, so the uniqueness above
      // must not be so broad that it forbids it.
      await repo().link({ userId: 1, provider: 'google', providerSubject: 'sub-1' });

      await expect(
        repo().link({
          userId: 1,
          provider: 'password',
          providerSubject: 'a@example.com',
          passwordHash: 'scrypt$hash',
        })
      ).resolves.toMatchObject({ userId: 1, provider: 'password' });
    });

    it('refuses a password identity with no hash', async () => {
      await expect(
        repo().link({ userId: 1, provider: 'password', providerSubject: 'a@example.com' })
      ).rejects.toThrow(/check constraint|password_hash_matches_provider/i);
    });

    it('refuses a hash on a google identity', async () => {
      // A hash on a federated identity would be a credential nobody set and
      // no flow can rotate.
      await expect(
        repo().link({
          userId: 1,
          provider: 'google',
          providerSubject: 'sub-1',
          passwordHash: 'scrypt$hash',
        })
      ).rejects.toThrow(/check constraint|password_hash_matches_provider/i);
    });

    it('refuses an identity for a user that does not exist', async () => {
      await expect(
        repo().link({ userId: 9999, provider: 'google', providerSubject: 'sub-1' })
      ).rejects.toThrow(/foreign key|violates/i);
    });

    it('drops a user\'s identities when the user is deleted', async () => {
      await repo().link({ userId: 1, provider: 'google', providerSubject: 'sub-1' });

      await database.db.execute(sql`DELETE FROM users WHERE id = 1`);

      expect(await repo().findByProviderSubject('google', 'sub-1')).toBeNull();
    });
  });

  describe('updatePasswordHash', () => {
    it('rewrites the hash and reports that it did', async () => {
      await repo().link({
        userId: 1,
        provider: 'password',
        providerSubject: 'a@example.com',
        passwordHash: 'old',
      });

      expect(await repo().updatePasswordHash(1, 'new')).toBe(true);
      expect((await repo().findByProviderSubject('password', 'a@example.com'))?.passwordHash).toBe(
        'new'
      );
    });

    it('reports false when the user has no password identity', async () => {
      // The boolean is how the reset flow tells "changed" from "there was
      // nothing to change". Returning true regardless would report success
      // for a reset that never happened.
      await repo().link({ userId: 1, provider: 'google', providerSubject: 'sub-1' });

      expect(await repo().updatePasswordHash(1, 'new')).toBe(false);
    });

    it('never touches a google identity', async () => {
      await repo().link({ userId: 1, provider: 'google', providerSubject: 'sub-1' });

      await repo().updatePasswordHash(1, 'new');

      expect((await repo().findByProviderSubject('google', 'sub-1'))?.passwordHash).toBeNull();
    });

    it('changes only the named user\'s password', async () => {
      await repo().link({
        userId: 1,
        provider: 'password',
        providerSubject: 'a@example.com',
        passwordHash: 'a-hash',
      });
      await repo().link({
        userId: 2,
        provider: 'password',
        providerSubject: 'b@example.com',
        passwordHash: 'b-hash',
      });

      await repo().updatePasswordHash(1, 'new');

      expect((await repo().findByProviderSubject('password', 'b@example.com'))?.passwordHash).toBe(
        'b-hash'
      );
    });
  });
});
