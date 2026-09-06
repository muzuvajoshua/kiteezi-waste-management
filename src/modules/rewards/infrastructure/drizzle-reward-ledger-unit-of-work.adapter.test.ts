import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDatabase, seedUsers, type TestDatabase } from '@/test-support/pglite-database';
import { PointTransactions, UserRewardBalance } from '@/utils/db/schema';
import {
  DrizzleRewardTransactionManager,
  wrapExistingTx,
} from './drizzle-reward-ledger-unit-of-work.adapter';

// KWM-063 — first coverage for the write side of the ledger.
//
// This is the highest-value code in the system: it mints points onto a
// balance. The invariant it exists to hold is that the append-only ledger and
// the materialised balance never disagree — sum(point_transactions.amount)
// must equal user_reward_balance.points — and that invariant is only real if
// both writes commit or neither does.
//
// The in-memory unit of work cannot show any of this. It has no transaction,
// so a rollback is a no-op there and a half-applied write is unrepresentable.
//
// NOT covered here, both for the same reason — PGlite is a single connection,
// so two transactions cannot race:
//
//   - Lock contention. getBalanceForUpdate issues SELECT … FOR UPDATE; the
//     statement runs, but nothing here can observe it blocking a second
//     writer.
//   - The ON CONFLICT arm of the fallback insert in appendTransaction. It
//     exists only for the window where a concurrent transaction creates the
//     balance row between this one's UPDATE and its INSERT. Mutation confirms
//     it is unreachable from this suite: changing its `set` clause breaks
//     nothing. Both need a multi-connection database.

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

const manager = () => new DrizzleRewardTransactionManager(database.db);

async function ledgerTotal(userId: number): Promise<number> {
  const rows = await database.db
    .select({ amount: PointTransactions.amount })
    .from(PointTransactions)
    .where(eq(PointTransactions.userId, userId));
  return rows.reduce((sum, row) => sum + row.amount, 0);
}

async function storedBalance(userId: number): Promise<number | null> {
  const [row] = await database.db
    .select({ points: UserRewardBalance.points })
    .from(UserRewardBalance)
    .where(eq(UserRewardBalance.userId, userId));
  return row?.points ?? null;
}

describe('DrizzleRewardLedgerUnitOfWork', () => {
  describe('appending to the ledger', () => {
    it('creates the balance row on a first grant', async () => {
      await manager().run((uow) =>
        uow.appendTransaction({
          userId: 1,
          kind: 'earn_report',
          amount: 10,
          relatedReportId: null,
          relatedRedemptionId: null,
          idempotencyKey: null,
        })
      );

      expect(await storedBalance(1)).toBe(10);
      expect(await ledgerTotal(1)).toBe(10);
    });

    it('adds to an existing balance rather than replacing it', async () => {
      // The upsert is ON CONFLICT DO UPDATE SET points = points + amount. A
      // plain overwrite would silently discard every earlier grant.
      const append = (amount: number) =>
        manager().run((uow) =>
          uow.appendTransaction({
            userId: 1,
            kind: 'earn_report',
            amount,
            relatedReportId: null,
            relatedRedemptionId: null,
            idempotencyKey: null,
          })
        );

      await append(10);
      await append(5);
      await append(7);

      expect(await storedBalance(1)).toBe(22);
      expect(await ledgerTotal(1)).toBe(22);
    });

    it('applies a redemption as a negative entry', async () => {
      const append = (amount: number, kind: 'earn_report' | 'redeem') =>
        manager().run((uow) =>
          uow.appendTransaction({
            userId: 1,
            kind,
            amount,
            relatedReportId: null,
            relatedRedemptionId: null,
            idempotencyKey: null,
          })
        );

      await append(20, 'earn_report');
      await append(-8, 'redeem');

      expect(await storedBalance(1)).toBe(12);
      expect(await ledgerTotal(1)).toBe(12);
    });

    it('credits only the named user', async () => {
      // The WHERE on the balance update. Without it a grant to one user
      // raises everybody's balance — found by mutation, which the earlier
      // cases missed because only one user ever held a balance.
      await database.db.insert(UserRewardBalance).values([
        { userId: 1, points: 10 },
        { userId: 2, points: 20 },
        { userId: 3, points: 30 },
      ]);

      await manager().run((uow) =>
        uow.appendTransaction({
          userId: 2,
          kind: 'earn_report',
          amount: 5,
          relatedReportId: null,
          relatedRedemptionId: null,
          idempotencyKey: null,
        })
      );

      expect(await storedBalance(1)).toBe(10);
      expect(await storedBalance(2)).toBe(25);
      expect(await storedBalance(3)).toBe(30);
    });

    it('reports true when the entry applied', async () => {
      const applied = await manager().run((uow) =>
        uow.appendTransaction({
          userId: 1,
          kind: 'earn_collect',
          amount: 10,
          relatedReportId: null,
          relatedRedemptionId: null,
          idempotencyKey: 'k-1',
        })
      );

      expect(applied).toBe(true);
    });
  });

  describe('idempotency', () => {
    it('a replayed key is refused and does not mint a second time', async () => {
      // This is what stops a retried request paying out twice. The UNIQUE
      // index does the work; the adapter must notice the no-op and skip the
      // balance update rather than adding the amount again.
      const grant = () =>
        manager().run((uow) =>
          uow.appendTransaction({
            userId: 1,
            kind: 'earn_collect',
            amount: 50,
            relatedReportId: null,
            relatedRedemptionId: null,
            idempotencyKey: 'grant-1',
          })
        );

      expect(await grant()).toBe(true);
      expect(await grant()).toBe(false);

      expect(await storedBalance(1)).toBe(50);
      expect(await ledgerTotal(1)).toBe(50);
    });

    it('distinct keys both apply', async () => {
      const grant = (key: string) =>
        manager().run((uow) =>
          uow.appendTransaction({
            userId: 1,
            kind: 'earn_collect',
            amount: 50,
            relatedReportId: null,
            relatedRedemptionId: null,
            idempotencyKey: key,
          })
        );

      await grant('grant-1');
      await grant('grant-2');

      expect(await storedBalance(1)).toBe(100);
    });

    it('a null key never collides with another null key', async () => {
      // NULL is distinct from NULL in a UNIQUE index. Grants without a key
      // must each apply, or ordinary un-keyed earning would stop after one.
      const grant = () =>
        manager().run((uow) =>
          uow.appendTransaction({
            userId: 1,
            kind: 'earn_report',
            amount: 10,
            relatedReportId: null,
            relatedRedemptionId: null,
            idempotencyKey: null,
          })
        );

      await grant();
      await grant();

      expect(await storedBalance(1)).toBe(20);
    });
  });

  describe('atomicity', () => {
    it('commits neither write when the work throws', async () => {
      // The reason this is a transaction at all. A ledger entry without its
      // balance update, or the reverse, breaks the invariant permanently and
      // silently.
      await expect(
        manager().run(async (uow) => {
          await uow.appendTransaction({
            userId: 1,
            kind: 'earn_report',
            amount: 10,
            relatedReportId: null,
            relatedRedemptionId: null,
            idempotencyKey: null,
          });
          throw new Error('the use-case changed its mind');
        })
      ).rejects.toThrow('the use-case changed its mind');

      expect(await storedBalance(1)).toBeNull();
      expect(await ledgerTotal(1)).toBe(0);
    });

    it('rolls the ledger entry back when the balance violates its CHECK', async () => {
      // Redeeming more than the balance trips CHECK (points >= 0). The entry
      // must not survive: a ledger row with no matching balance change is
      // exactly the drift the invariant forbids.
      await expect(
        manager().run((uow) =>
          uow.appendTransaction({
            userId: 1,
            kind: 'redeem',
            amount: -5,
            relatedReportId: null,
            relatedRedemptionId: null,
            idempotencyKey: null,
          })
        )
      ).rejects.toThrow(/check constraint|points_nonneg/i);

      expect(await ledgerTotal(1)).toBe(0);
      expect(await storedBalance(1)).toBeNull();
    });

    it('leaves earlier committed grants intact after a later rollback', async () => {
      const append = (amount: number) =>
        manager().run((uow) =>
          uow.appendTransaction({
            userId: 1,
            kind: 'earn_report',
            amount,
            relatedReportId: null,
            relatedRedemptionId: null,
            idempotencyKey: null,
          })
        );
      await append(30);

      await expect(
        manager().run(async (uow) => {
          await uow.appendTransaction({
            userId: 1,
            kind: 'earn_report',
            amount: 5,
            relatedReportId: null,
            relatedRedemptionId: null,
            idempotencyKey: null,
          });
          throw new Error('nope');
        })
      ).rejects.toThrow('nope');

      expect(await storedBalance(1)).toBe(30);
      expect(await ledgerTotal(1)).toBe(30);
    });
  });

  describe('getBalanceForUpdate', () => {
    it('reports zero for a user with no balance row', async () => {
      expect(await manager().run((uow) => uow.getBalanceForUpdate(1))).toBe(0);
    });

    it('reports the current balance', async () => {
      await database.db.insert(UserRewardBalance).values({ userId: 1, points: 42 });

      expect(await manager().run((uow) => uow.getBalanceForUpdate(1))).toBe(42);
    });

    it('reports the named user\'s balance, not the first row', async () => {
      await database.db.insert(UserRewardBalance).values([
        { userId: 1, points: 10 },
        { userId: 2, points: 20 },
      ]);

      expect(await manager().run((uow) => uow.getBalanceForUpdate(2))).toBe(20);
    });
  });

  describe('wrapExistingTx', () => {
    it('joins the caller\'s transaction instead of opening its own', async () => {
      // createReport uses this so the points mint commits atomically with the
      // report insert. If it opened a second transaction the mint would
      // survive a rollback of the report.
      await expect(
        database.db.transaction(async (tx) => {
          await wrapExistingTx(tx).run((uow) =>
            uow.appendTransaction({
              userId: 1,
              kind: 'earn_report',
              amount: 10,
              relatedReportId: null,
              relatedRedemptionId: null,
              idempotencyKey: null,
            })
          );
          throw new Error('report insert failed');
        })
      ).rejects.toThrow('report insert failed');

      expect(await storedBalance(1)).toBeNull();
      expect(await ledgerTotal(1)).toBe(0);
    });

    it('commits with the caller\'s transaction', async () => {
      await database.db.transaction(async (tx) => {
        await wrapExistingTx(tx).run((uow) =>
          uow.appendTransaction({
            userId: 1,
            kind: 'earn_report',
            amount: 10,
            relatedReportId: null,
            relatedRedemptionId: null,
            idempotencyKey: null,
          })
        );
      });

      expect(await storedBalance(1)).toBe(10);
    });
  });

  it('keeps the ledger and the balance in agreement across a mixed sequence', async () => {
    // The invariant, asserted end to end rather than per operation.
    const append = (amount: number, kind: 'earn_report' | 'earn_collect' | 'redeem', key?: string) =>
      manager()
        .run((uow) =>
          uow.appendTransaction({
            userId: 1,
            kind,
            amount,
            relatedReportId: null,
            relatedRedemptionId: null,
            idempotencyKey: key ?? null,
          })
        )
        .catch(() => false);

    await append(10, 'earn_report');
    await append(25, 'earn_collect', 'k1');
    await append(25, 'earn_collect', 'k1'); // replay, must not apply
    await append(-5, 'redeem');
    await append(-1000, 'redeem'); // refused by the CHECK, must roll back
    await append(3, 'earn_report');

    expect(await storedBalance(1)).toBe(33);
    expect(await ledgerTotal(1)).toBe(33);
  });
});
