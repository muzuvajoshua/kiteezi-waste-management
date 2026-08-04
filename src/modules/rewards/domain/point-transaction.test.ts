import { describe, it, expect } from 'vitest';
import { createPointTransaction } from './point-transaction';
import { InvalidPointTransactionError } from './errors';

describe('createPointTransaction', () => {
  it('builds an earn_report entry with a positive amount', () => {
    const tx = createPointTransaction({ userId: 7, kind: 'earn_report', amount: 10, relatedReportId: 3 });
    expect(tx).toEqual({
      userId: 7,
      kind: 'earn_report',
      amount: 10,
      relatedReportId: 3,
      relatedRedemptionId: null,
      idempotencyKey: null,
    });
  });

  it('defaults optional correlation fields to null', () => {
    const tx = createPointTransaction({ userId: 7, kind: 'earn_collect', amount: 5 });
    expect(tx.relatedReportId).toBeNull();
    expect(tx.relatedRedemptionId).toBeNull();
    expect(tx.idempotencyKey).toBeNull();
  });

  it('rejects a non-positive amount for earn_report / earn_collect', () => {
    expect(() => createPointTransaction({ userId: 7, kind: 'earn_report', amount: 0 })).toThrow(
      InvalidPointTransactionError
    );
    expect(() => createPointTransaction({ userId: 7, kind: 'earn_collect', amount: -5 })).toThrow(
      InvalidPointTransactionError
    );
  });

  it('builds a redeem entry with a negative amount', () => {
    const tx = createPointTransaction({ userId: 7, kind: 'redeem', amount: -25, relatedRedemptionId: 4 });
    expect(tx.amount).toBe(-25);
    expect(tx.relatedRedemptionId).toBe(4);
  });

  it('rejects a non-negative amount for redeem', () => {
    expect(() => createPointTransaction({ userId: 7, kind: 'redeem', amount: 0 })).toThrow(
      InvalidPointTransactionError
    );
    expect(() => createPointTransaction({ userId: 7, kind: 'redeem', amount: 5 })).toThrow(
      InvalidPointTransactionError
    );
  });

  it('allows adjust to be positive or negative, but not zero', () => {
    expect(createPointTransaction({ userId: 7, kind: 'adjust', amount: 3 }).amount).toBe(3);
    expect(createPointTransaction({ userId: 7, kind: 'adjust', amount: -3 }).amount).toBe(-3);
    expect(() => createPointTransaction({ userId: 7, kind: 'adjust', amount: 0 })).toThrow(
      InvalidPointTransactionError
    );
  });
});
