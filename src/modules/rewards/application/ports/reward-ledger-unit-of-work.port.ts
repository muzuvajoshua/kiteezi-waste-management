import type { PointTransaction } from '../../domain/point-transaction';

// Write-side port for the ledger, always used inside a transaction (either
// one this port opens itself, or one an already-open caller transaction
// hands in — see infrastructure/drizzle-reward-ledger-unit-of-work.adapter.ts's
// wrapExistingTx). getBalanceForUpdate locks the row (SELECT ... FOR UPDATE)
// so concurrent redemptions can't both read a stale balance.
export interface RewardLedgerUnitOfWork {
  getBalanceForUpdate(userId: number): Promise<number>;
  // Returns false when `entry.idempotencyKey` was already applied (no-op) —
  // same contract as today's internal.ts recordPointTransaction.
  appendTransaction(entry: PointTransaction): Promise<boolean>;
}
