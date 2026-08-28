import { InvalidPointTransactionError } from './errors';

// Deliberately NOT imported from utils/db/schema.ts's pointKindEnum: the
// Domain layer must not depend on Drizzle (even for a type-only import of a
// module that also constructs pgTable objects). The Infrastructure adapter
// maps between this union and the DB enum at the boundary — the string
// values are kept identical by convention, not by a shared import.
export type PointKind = 'earn_report' | 'earn_collect' | 'redeem' | 'adjust';

// A ledger entry about to be appended. No `id`/`createdAt`: those are
// assigned by storage on insert, so a not-yet-persisted entry can't have them.
export interface PointTransaction {
  readonly userId: number;
  readonly kind: PointKind;
  readonly amount: number;
  readonly relatedReportId: number | null;
  readonly relatedRedemptionId: number | null;
  readonly idempotencyKey: string | null;
}

/**
 * Constructs a ledger entry, enforcing the sign-per-kind invariant:
 * earn_report/earn_collect > 0, redeem < 0, adjust != 0. Mirrors the
 * convention `SUM(point_transactions.amount) == user_reward_balance.points`
 * already relies on in the DB layer, moved here so it can't be bypassed by
 * a future call site.
 */
export function createPointTransaction(params: {
  userId: number;
  kind: PointKind;
  amount: number;
  relatedReportId?: number | null;
  relatedRedemptionId?: number | null;
  idempotencyKey?: string | null;
}): PointTransaction {
  const {
    userId,
    kind,
    amount,
    relatedReportId = null,
    relatedRedemptionId = null,
    idempotencyKey = null,
  } = params;

  assertSignForKind(kind, amount);

  return { userId, kind, amount, relatedReportId, relatedRedemptionId, idempotencyKey };
}

function assertSignForKind(kind: PointKind, amount: number): void {
  switch (kind) {
    case 'earn_report':
    case 'earn_collect':
      if (amount <= 0) {
        throw new InvalidPointTransactionError(
          `${kind} transactions must have a positive amount, got ${amount}`
        );
      }
      return;
    case 'redeem':
      if (amount >= 0) {
        throw new InvalidPointTransactionError(
          `redeem transactions must have a negative amount, got ${amount}`
        );
      }
      return;
    case 'adjust':
      if (amount === 0) {
        throw new InvalidPointTransactionError('adjust transactions must have a non-zero amount');
      }
      return;
  }
}
