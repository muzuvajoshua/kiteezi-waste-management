import { describe, it, expect } from 'vitest';
import type { RewardRepository } from '../application/ports/reward-repository.port';
import type { PointKind } from '../domain/point-transaction';
import { InMemoryRewardRepository } from './in-memory-reward-repository.adapter';

export interface RewardRepositoryContractHarness {
  readonly repository: RewardRepository;
  seedBalance(userId: number, points: number, userName?: string | null): Promise<void>;
  seedTransaction(
    userId: number,
    record: { kind: PointKind; amount: number; relatedReportId?: number | null; createdAt: Date }
  ): Promise<void>;
}

// Shared behavioral contract for any RewardRepository implementation —
// guarantees the in-memory fake never drifts from real behavior. Run here
// against InMemoryRewardRepository; re-run against DrizzleRewardRepository
// once a live/staging Postgres is available in CI (KWM-063). That second run
// is intentionally NOT wired up yet — this repo has no live DB in this
// environment — rather than faked or skipped silently.
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

testRewardRepositoryContract('InMemoryRewardRepository', () => {
  const repository = new InMemoryRewardRepository();
  return {
    repository,
    seedBalance: async (userId, points, userName = null) => repository.seedBalance(userId, points, userName),
    seedTransaction: async (userId, record) =>
      repository.seedTransaction(userId, { ...record, relatedReportId: record.relatedReportId ?? null }),
  };
});
