import { describe, it, expect } from 'vitest';
import type { UserRepository } from '../application/ports/user-repository.port';
import { InMemoryUserRepository } from './in-memory-user-repository.adapter';

export interface UserRepositoryContractHarness {
  readonly repository: UserRepository;
  seedUser(id: number, email: string, name: string): Promise<void>;
}

// Shared behavioral contract for any UserRepository implementation. Run
// here against InMemoryUserRepository; re-run against DrizzleUserRepository
// once a live/staging Postgres is available in CI (KWM-063) — intentionally
// NOT wired up yet, matching rewards/infrastructure/reward-repository.contract.test.ts's
// precedent (no live DB in this environment).
export function testUserRepositoryContract(
  name: string,
  createHarness: () => UserRepositoryContractHarness
): void {
  describe(`UserRepository contract: ${name}`, () => {
    it('getUserById returns null for a missing user', async () => {
      const { repository } = createHarness();
      expect(await repository.getUserById(999)).toBeNull();
    });

    it('getUserById returns the seeded user', async () => {
      const { repository, seedUser } = createHarness();
      await seedUser(1, 'a@example.com', 'Ada');
      expect(await repository.getUserById(1)).toEqual({ id: 1, email: 'a@example.com', name: 'Ada' });
    });

    it('getUserByEmail returns null for a missing user', async () => {
      const { repository } = createHarness();
      expect(await repository.getUserByEmail('missing@example.com')).toBeNull();
    });

    it('getUserByEmail returns the seeded user', async () => {
      const { repository, seedUser } = createHarness();
      await seedUser(2, 'b@example.com', 'Bea');
      expect(await repository.getUserByEmail('b@example.com')).toEqual({ id: 2, email: 'b@example.com', name: 'Bea' });
    });

    it('createUser returns the new user, retrievable afterwards', async () => {
      const { repository } = createHarness();
      const created = await repository.createUser('c@example.com', 'Cy');
      expect(created).not.toBeNull();
      expect(created).toMatchObject({ email: 'c@example.com', name: 'Cy' });
      expect(await repository.getUserById(created!.id)).toEqual(created);
    });
  });
}

testUserRepositoryContract('InMemoryUserRepository', () => {
  const repository = new InMemoryUserRepository();
  return {
    repository,
    seedUser: async (id, email, name) => repository.seed({ id, email, name }),
  };
});
