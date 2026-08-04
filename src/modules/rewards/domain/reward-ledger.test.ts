import { describe, it, expect } from 'vitest';
import { RewardLedger } from './reward-ledger';
import { InsufficientPointsError, InvalidPointTransactionError } from './errors';

describe('RewardLedger', () => {
  it('forBalance seeds the starting balance', () => {
    const ledger = RewardLedger.forBalance(7, 50);
    expect(ledger.userId).toBe(7);
    expect(ledger.balance).toBe(50);
  });

  it('applyEarn increases the balance and returns a new instance', () => {
    const before = RewardLedger.forBalance(7, 50);
    const after = before.applyEarn(10);
    expect(after.balance).toBe(60);
    expect(before.balance).toBe(50); // immutable — original untouched
  });

  it('applyEarn rejects a non-positive amount', () => {
    const ledger = RewardLedger.forBalance(7, 50);
    expect(() => ledger.applyEarn(0)).toThrow(InvalidPointTransactionError);
    expect(() => ledger.applyEarn(-5)).toThrow(InvalidPointTransactionError);
  });

  it('applyRedeem decreases the balance when sufficient', () => {
    const before = RewardLedger.forBalance(7, 50);
    const after = before.applyRedeem(30);
    expect(after.balance).toBe(20);
    expect(before.balance).toBe(50);
  });

  it('applyRedeem allows draining the balance to exactly zero', () => {
    const ledger = RewardLedger.forBalance(7, 50).applyRedeem(50);
    expect(ledger.balance).toBe(0);
  });

  it('applyRedeem throws InsufficientPointsError rather than going negative', () => {
    const ledger = RewardLedger.forBalance(7, 20);
    expect(() => ledger.applyRedeem(21)).toThrow(InsufficientPointsError);
  });

  it('applyRedeem rejects a non-positive amount', () => {
    const ledger = RewardLedger.forBalance(7, 50);
    expect(() => ledger.applyRedeem(0)).toThrow(InvalidPointTransactionError);
    expect(() => ledger.applyRedeem(-5)).toThrow(InvalidPointTransactionError);
  });
});
