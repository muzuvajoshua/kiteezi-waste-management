import { DomainError } from '@/shared/domain/domain-error';

// KWM-011 — domain errors for the reward flows. Each carries an explicit,
// stable `code` so the Application layer can map it into an AppError (see
// shared/application/app-error.ts's fromDomainError) without matching on
// message strings. Moved from src/lib/errors.ts onto the shared DomainError
// base (Phase 0) — `name` is now set by the base class from the concrete
// constructor, so subclasses no longer repeat it themselves.

export class InsufficientPointsError extends DomainError {
  readonly code = 'INSUFFICIENT_POINTS' as const;
  constructor(message = 'Insufficient points for this redemption') {
    super(message);
  }
}

export class RewardUnavailableError extends DomainError {
  readonly code = 'REWARD_UNAVAILABLE' as const;
  constructor(message = 'Reward is not available') {
    super(message);
  }
}

// Guards the ledger's sign-per-kind invariant (see point-transaction.ts /
// reward-ledger.ts) — a defensive check against a caller bug, not a
// user-facing validation failure (that's Zod's job at the presentation
// boundary).
export class InvalidPointTransactionError extends DomainError {
  readonly code = 'INVALID_POINT_TRANSACTION' as const;
  constructor(message: string) {
    super(message);
  }
}
