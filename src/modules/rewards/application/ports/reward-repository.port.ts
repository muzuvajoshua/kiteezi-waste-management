import type { PointKind } from '../../domain/point-transaction';

export interface PointTransactionRecord {
  readonly id: number;
  readonly kind: PointKind;
  readonly amount: number;
  readonly relatedReportId: number | null;
  readonly createdAt: Date;
}

export interface PointTransactionCursor {
  readonly createdAt: Date;
  readonly id: number;
}

export interface PointTransactionPage {
  readonly items: readonly PointTransactionRecord[];
  readonly nextCursor: PointTransactionCursor | null;
}

// Denormalized read row for the admin "all balances" view — a reporting-query
// join across user_reward_balance ⨝ users. Deliberately documented as a
// narrow exception to strict module isolation for reads (CQRS-lite: read
// models may cross module boundaries more freely than write paths), not a
// domain dependency on a `users` module.
export interface RewardBalanceRow {
  readonly userId: number;
  readonly points: number;
  readonly userName: string | null;
}

// Read-side port: plain balance/history lookups, backed by the http (non-tx)
// client. Locked, in-transaction balance reads for redemption live on
// RewardLedgerUnitOfWork instead (see reward-ledger-unit-of-work.port.ts).
export interface RewardRepository {
  getBalance(userId: number): Promise<number>;
  getTransactions(
    userId: number,
    opts: { limit: number; cursor?: PointTransactionCursor }
  ): Promise<PointTransactionPage>;
  getAllBalances(): Promise<readonly RewardBalanceRow[]>;
}
