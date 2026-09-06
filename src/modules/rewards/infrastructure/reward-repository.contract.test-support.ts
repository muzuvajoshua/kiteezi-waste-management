import { describe, it, expect } from 'vitest';
import type { RewardRepository } from '../application/ports/reward-repository.port';
import type { PointKind } from '../domain/point-transaction';

export interface RewardRepositoryContractHarness {
  readonly repository: RewardRepository;
  seedBalance(userId: number, points: number, userName?: string | null): Promise<void>;
  seedTransaction(
    userId: number,
    record: { kind: PointKind; amount: number; relatedReportId?: number | null; createdAt: Date }
  ): Promise<void>;
}

// Shared behavioral contract for any RewardRepository implementation. Two
// files invoke it: in-memory-…adapter.test.ts with the fake, and
// drizzle-…adapter.test.ts against a real Postgres (KWM-063). Both run these
// same assertions, which is what stops the fake drifting from the
// implementation it stands in for.
//
// KWM-063 also made this a `.test-support.ts` module. It used to be a
// `.contract.test.ts` that both defined the contract AND ran it against the
// fake at import time, so a second file importing the function would re-run
// the whole in-memory suite inside itself.
export function testRewardRepositoryContract(
  name: string,
  createHarness: () => RewardRepositoryContractHarness
): void {
  describe(`RewardRepository contract: ${name}`, () => {
    it('getBalance returns 0 for a user with no balance row', async () => {
      const { repository } = createHarness();
      expect(await repository.getBalance(42)).toBe(0);
    });

    it('getBalance returns the seeded balance', async () => {
      const { repository, seedBalance } = createHarness();
      await seedBalance(7, 25);
      expect(await repository.getBalance(7)).toBe(25);
    });

    it('getTransactions returns newest-first and paginates via a keyset cursor', async () => {
      const { repository, seedTransaction } = createHarness();
      await seedTransaction(7, { kind: 'earn_report', amount: 10, createdAt: new Date('2026-01-01T00:00:00Z') });
      await seedTransaction(7, { kind: 'earn_report', amount: 5, createdAt: new Date('2026-01-02T00:00:00Z') });
      await seedTransaction(7, { kind: 'redeem', amount: -5, createdAt: new Date('2026-01-03T00:00:00Z') });

      const page1 = await repository.getTransactions(7, { limit: 2 });
      expect(page1.items).toHaveLength(2);
      expect(page1.items[0].amount).toBe(-5); // newest first
      expect(page1.nextCursor).not.toBeNull();

      const page2 = await repository.getTransactions(7, { limit: 2, cursor: page1.nextCursor! });
      expect(page2.items).toHaveLength(1);
      expect(page2.items[0].amount).toBe(10);
      expect(page2.nextCursor).toBeNull();
    });

    it('getAllBalances returns every seeded user, highest points first', async () => {
      const { repository, seedBalance } = createHarness();
      await seedBalance(1, 10, 'Alice');
      await seedBalance(2, 50, 'Bob');

      expect(await repository.getAllBalances()).toEqual([
        { userId: 2, points: 50, userName: 'Bob' },
        { userId: 1, points: 10, userName: 'Alice' },
      ]);
    });
  });
}
