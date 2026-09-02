import { eq, sql } from 'drizzle-orm';
import type { Database, DatabaseTx } from '@/shared/infrastructure/persistence/database';
import { PointTransactions, UserRewardBalance } from '@/utils/db/schema';
import type { PointTransaction } from '../domain/point-transaction';
import type { RewardLedgerUnitOfWork } from '../application/ports/reward-ledger-unit-of-work.port';
import type { TransactionManager } from '@/shared/application/ports/transaction-manager';

// Write side: append-only ledger insert + materialised balance update kept
// in lockstep, relocated unchanged from utils/db/internal.ts's
// recordPointTransaction. Only ever constructed with an already-open `tx` —
// see wrapExistingTx / DrizzleRewardTransactionManager below for the two
// ways one gets opened.
export class DrizzleRewardLedgerUnitOfWork implements RewardLedgerUnitOfWork {
  constructor(private readonly tx: DatabaseTx) {}

  async getBalanceForUpdate(userId: number): Promise<number> {
    const [row] = await this.tx
      .select({ points: UserRewardBalance.points })
      .from(UserRewardBalance)
      .where(eq(UserRewardBalance.userId, userId))
      .for('update');
    return row?.points ?? 0;
  }

  async appendTransaction(entry: PointTransaction): Promise<boolean> {
    const inserted = await this.tx
      .insert(PointTransactions)
      .values({
        userId: entry.userId,
        kind: entry.kind,
        amount: entry.amount,
        relatedReportId: entry.relatedReportId,
        relatedRedemptionId: entry.relatedRedemptionId,
        idempotencyKey: entry.idempotencyKey,
      })
      .onConflictDoNothing({ target: PointTransactions.idempotencyKey })
      .returning({ id: PointTransactions.id });

    if (inserted.length === 0) return false; // duplicate idempotency key — already applied

    // Update first, insert only if there was no row.
    //
    // This was a single INSERT … ON CONFLICT DO UPDATE, which cannot apply a
    // negative amount: Postgres validates CHECK constraints against the
    // PROPOSED insert tuple before it resolves the conflict, so a redemption
    // of -8 was rejected by user_reward_balance_points_nonneg however large
    // the balance was. Redeeming a reward could never succeed. Found by
    // KWM-063's first run of this adapter against a real database — no
    // in-memory fake models a CHECK, so nothing above could see it.
    const updated = await this.tx
      .update(UserRewardBalance)
      .set({ points: sql`${UserRewardBalance.points} + ${entry.amount}`, updatedAt: new Date() })
      .where(eq(UserRewardBalance.userId, entry.userId))
      .returning({ userId: UserRewardBalance.userId });

    if (updated.length === 0) {
      // No balance yet. ON CONFLICT still covers the race where a concurrent
      // transaction created the row between the update and here.
      await this.tx
        .insert(UserRewardBalance)
        .values({ userId: entry.userId, points: entry.amount })
        .onConflictDoUpdate({
          target: UserRewardBalance.userId,
          set: { points: sql`${UserRewardBalance.points} + ${entry.amount}`, updatedAt: new Date() },
        });
    }

    // The CHECK is still the guard on the floor: an update that would take
    // the balance below zero raises here and rolls the ledger entry back with
    // it, so the two can never disagree.
    return true;
  }
}

// Adapts an already-open Drizzle transaction into a
// TransactionManager<RewardLedgerUnitOfWork> whose `.run()` reuses it
// instead of opening a new one — for call sites (createReport) that need the
// point mint to be atomic with other writes they're already doing in the
// same transaction.
export function wrapExistingTx(tx: DatabaseTx): TransactionManager<RewardLedgerUnitOfWork> {
  return {
    run<T>(work: (uow: RewardLedgerUnitOfWork) => Promise<T>): Promise<T> {
      return work(new DrizzleRewardLedgerUnitOfWork(tx));
    },
  };
}

// Opens its own transaction — for call sites (redeemReward, saveReward) that
// don't already have one open.
export class DrizzleRewardTransactionManager implements TransactionManager<RewardLedgerUnitOfWork> {
  constructor(private readonly db: Database) {}

  run<T>(work: (uow: RewardLedgerUnitOfWork) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => work(new DrizzleRewardLedgerUnitOfWork(tx)));
  }
}
