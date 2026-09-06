import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDatabase, seedUsers, type TestDatabase } from '@/test-support/pglite-database';
import { Reports, PointTransactions, UserRewardBalance } from '@/utils/db/schema';
import { DrizzleReportTransactionManager } from './drizzle-report-transaction-manager.adapter';

// KWM-063 — first coverage for this adapter.
//
// This is the one deliberate Infrastructure-to-Infrastructure cross-module
// seam in the codebase: creating a report and minting the points it earns
// must land in a single transaction, or a user gets a report with no points
// or points with no report. The unit of work exposes the rewards ledger
// through `rewardLedgerTxManager`, and the whole point is that it reuses
// *this* transaction rather than opening a second one.
//
// None of this is observable through the in-memory unit of work, which has no
// transaction to share.

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

const manager = () => new DrizzleReportTransactionManager(database.db);

const input = {
  userId: 1,
  location: 'Kiteezi',
  wasteType: 'plastic' as const,
  amount: '3',
};

const reportsFor = (userId: number) =>
  database.db.select().from(Reports).where(eq(Reports.user_id, userId));
const balanceFor = async (userId: number) => {
  const [row] = await database.db
    .select({ points: UserRewardBalance.points })
    .from(UserRewardBalance)
    .where(eq(UserRewardBalance.userId, userId));
  return row?.points ?? null;
};

describe('DrizzleReportTransactionManager', () => {
  it('inserts a report and returns it in domain shape', async () => {
    const created = await manager().run((uow) => uow.insert(input));

    expect(created).toMatchObject({
      userId: 1,
      location: 'Kiteezi',
      wasteType: 'plastic',
      amount: '3',
      status: 'pending',
      collectorId: null,
      verificationResult: null,
    });
    expect(created.createdAt).toBeInstanceOf(Date);
  });

  it('never trusts a client-supplied verification result', async () => {
    // Set server-side to null (KWM-043): the AI verdict is written later by
    // a path the reporter does not control.
    const created = await manager().run((uow) =>
      uow.insert({ ...input, imageUrl: 'https://example.com/a.jpg' })
    );

    expect(created.verificationResult).toBeNull();
    expect(created.status).toBe('pending');
  });

  it('commits the report when the work completes', async () => {
    await manager().run((uow) => uow.insert(input));

    expect(await reportsFor(1)).toHaveLength(1);
  });

  it('commits nothing when the work throws', async () => {
    await expect(
      manager().run(async (uow) => {
        await uow.insert(input);
        throw new Error('notification failed');
      })
    ).rejects.toThrow('notification failed');

    expect(await reportsFor(1)).toEqual([]);
  });

  it('rolls back the report when the points mint fails', async () => {
    // The reason the two share a transaction. A redemption-sized negative
    // grant trips the balance CHECK; the report must not survive it.
    await expect(
      manager().run(async (uow) => {
        await uow.insert(input);
        await uow.rewardLedgerTxManager.run((ledger) =>
          ledger.appendTransaction({
            userId: 1,
            kind: 'redeem',
            amount: -100,
            relatedReportId: null,
            relatedRedemptionId: null,
            idempotencyKey: null,
          })
        );
      })
    ).rejects.toThrow(/check constraint|points_nonneg/i);

    expect(await reportsFor(1)).toEqual([]);
    expect(await balanceFor(1)).toBeNull();
  });

  it('rolls back the points mint when the report work fails afterwards', async () => {
    // The mirror case: the ledger must not commit on its own transaction.
    await expect(
      manager().run(async (uow) => {
        await uow.insert(input);
        await uow.rewardLedgerTxManager.run((ledger) =>
          ledger.appendTransaction({
            userId: 1,
            kind: 'earn_report',
            amount: 10,
            relatedReportId: null,
            relatedRedemptionId: null,
            idempotencyKey: null,
          })
        );
        throw new Error('changed our mind');
      })
    ).rejects.toThrow('changed our mind');

    expect(await reportsFor(1)).toEqual([]);
    expect(await balanceFor(1)).toBeNull();
    expect(await database.db.select().from(PointTransactions)).toEqual([]);
  });

  it('commits the report and its points together', async () => {
    const created = await manager().run(async (uow) => {
      const report = await uow.insert(input);
      await uow.rewardLedgerTxManager.run((ledger) =>
        ledger.appendTransaction({
          userId: 1,
          kind: 'earn_report',
          amount: 10,
          relatedReportId: report.id,
          relatedRedemptionId: null,
          idempotencyKey: null,
        })
      );
      return report;
    });

    expect(await reportsFor(1)).toHaveLength(1);
    expect(await balanceFor(1)).toBe(10);
    const [entry] = await database.db.select().from(PointTransactions);
    expect(entry.relatedReportId).toBe(created.id);
  });

  it('refuses a report for a user that does not exist', async () => {
    await expect(manager().run((uow) => uow.insert({ ...input, userId: 9999 }))).rejects.toThrow(
      /foreign key|violates/i
    );
  });

  it('rejects a waste type outside the enum', async () => {
    await expect(
      manager().run((uow) =>
        uow.insert({ ...input, wasteType: 'radioactive' as unknown as 'plastic' })
      )
    ).rejects.toThrow(/invalid input value for enum|radioactive/i);
  });

  it('stores a null imageUrl when none is given', async () => {
    const created = await manager().run((uow) => uow.insert(input));

    expect(created.imageUrl).toBeNull();
  });
});
