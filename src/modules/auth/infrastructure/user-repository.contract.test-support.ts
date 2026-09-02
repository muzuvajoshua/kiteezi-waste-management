import { describe, it, expect } from 'vitest';
import type { UserRepository } from '../application/ports/user-repository.port';

export interface UserRepositoryContractHarness {
  readonly repository: UserRepository;
  seedUser(id: number, email: string, name: string): Promise<void>;
}

// Shared behavioral contract for any UserRepository implementation. Two
// files invoke it: in-memory-…adapter.test.ts with the fake, and
// drizzle-…adapter.test.ts against a real Postgres (KWM-063). Both run these
// same assertions, which is what stops the fake drifting from the
// implementation it stands in for.
//
// KWM-063 also made this a `.test-support.ts` module. It used to be a
// `.contract.test.ts` that both defined the contract AND ran it against the
// fake at import time, so a second file importing the function would re-run
// the whole in-memory suite inside itself.
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
