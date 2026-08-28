import { eq, sql } from 'drizzle-orm';
import { txdb, type RewardTx } from '@/utils/db/txClient';
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
  constructor(private readonly tx: RewardTx) {}

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

    await this.tx
      .insert(UserRewardBalance)
      .values({ userId: entry.userId, points: entry.amount })
      .onConflictDoUpdate({
        target: UserRewardBalance.userId,
        set: { points: sql`${UserRewardBalance.points} + ${entry.amount}`, updatedAt: new Date() },
      });

    return true;
  }
}

// Adapts an already-open Drizzle transaction into a
// TransactionManager<RewardLedgerUnitOfWork> whose `.run()` reuses it
// instead of opening a new one — for call sites (createReport) that need the
// point mint to be atomic with other writes they're already doing in the
// same transaction.
export function wrapExistingTx(tx: RewardTx): TransactionManager<RewardLedgerUnitOfWork> {
  return {
    run<T>(work: (uow: RewardLedgerUnitOfWork) => Promise<T>): Promise<T> {
      return work(new DrizzleRewardLedgerUnitOfWork(tx));
    },
  };
}

// Opens its own transaction — for call sites (redeemReward, saveReward) that
// don't already have one open.
export class DrizzleRewardTransactionManager implements TransactionManager<RewardLedgerUnitOfWork> {
  run<T>(work: (uow: RewardLedgerUnitOfWork) => Promise<T>): Promise<T> {
    return txdb.transaction((tx) => work(new DrizzleRewardLedgerUnitOfWork(tx)));
  }
}
