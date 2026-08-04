import { describe, it, expect } from 'vitest';
import { InMemoryRewardTransactionManager } from '../infrastructure/in-memory-reward-ledger-unit-of-work.adapter';
import { earnPoints } from './earn-points.usecase';

describe('earnPoints', () => {
  it('applies and returns the updated balance', async () => {
    const txManager = new InMemoryRewardTransactionManager();
    txManager.seedBalance(7, 40);

    const result = await earnPoints(txManager, { userId: 7, kind: 'earn_report', amount: 10, relatedReportId: 3 });

    expect(result).toEqual({ ok: true, value: { applied: true, balance: 50 } });
    expect(txManager.balances.get(7)).toBe(50);
    expect(txManager.transactions).toHaveLength(1);
    expect(txManager.transactions[0]).toMatchObject({ kind: 'earn_report', amount: 10, relatedReportId: 3 });
  });

  it('is a no-op on a duplicate idempotency key, balance unchanged', async () => {
    const txManager = new InMemoryRewardTransactionManager();
    txManager.seedBalance(7, 40);
    await earnPoints(txManager, {
      userId: 7,
      kind: 'earn_report',
      amount: 10,
      idempotencyKey: 'report:1:earn',
    });

    const result = await earnPoints(txManager, {
      userId: 7,
      kind: 'earn_report',
      amount: 10,
      idempotencyKey: 'report:1:earn',
    });

    expect(result).toEqual({ ok: true, value: { applied: false, balance: 50 } });
    expect(txManager.balances.get(7)).toBe(50); // not double-credited
    expect(txManager.transactions).toHaveLength(1);
  });

  it('maps an invalid amount to a CONFLICT AppError carrying the domain code', async () => {
    const txManager = new InMemoryRewardTransactionManager();
    txManager.seedBalance(7, 0);

    const result = await earnPoints(txManager, { userId: 7, kind: 'earn_report', amount: 0 });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('CONFLICT');
      expect(result.error.domainCode).toBe('INVALID_POINT_TRANSACTION');
    }
  });
});
