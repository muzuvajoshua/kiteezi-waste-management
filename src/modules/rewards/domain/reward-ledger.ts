import { InsufficientPointsError, InvalidPointTransactionError } from './errors';

// Aggregate guarding the ledger's core invariant: a user's balance is never
// negative, and only ever moves by an earn or a redeem of a positive amount
// (the sign flip for the persisted ledger entry happens at the
// Infrastructure boundary via point-transaction.ts's createPointTransaction,
// not here — this object works in "how many points" terms, not signed
// ledger-entry terms). Immutable: each apply* returns a new instance rather
// than mutating in place.
export class RewardLedger {
  private constructor(
    private readonly _userId: number,
    private readonly _balance: number
  ) {}

  static forBalance(userId: number, balance: number): RewardLedger {
    return new RewardLedger(userId, balance);
  }

  get userId(): number {
    return this._userId;
  }

  get balance(): number {
    return this._balance;
  }

  applyEarn(amount: number): RewardLedger {
    if (amount <= 0) {
      throw new InvalidPointTransactionError(`earn amount must be positive, got ${amount}`);
    }
    return new RewardLedger(this._userId, this._balance + amount);
  }

  applyRedeem(amount: number): RewardLedger {
    if (amount <= 0) {
      throw new InvalidPointTransactionError(`redeem amount must be positive, got ${amount}`);
    }
    if (this._balance - amount < 0) {
      throw new InsufficientPointsError();
    }
    return new RewardLedger(this._userId, this._balance - amount);
  }
}
