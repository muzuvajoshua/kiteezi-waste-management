import { describe, it, expect } from 'vitest';

// Mock the http client so importing internal.ts doesn't construct a real neon
// connection. (txClient is imported type-only in internal.ts, so it is erased.)
import { vi } from 'vitest';
vi.mock('./dbConfig', () => ({ db: {} }));

import { recordPointTransaction } from './internal';
import { PointTransactions, UserRewardBalance } from './schema';
import { InsufficientPointsError, RewardUnavailableError } from '@/lib/errors';
import {
  saveRewardSchema,
  rewardTransactionsQuerySchema,
  redeemRewardSchema,
} from './schemas';
import { MAX_POINTS } from './schemas/common';

type RecordTx = Parameters<typeof recordPointTransaction>[0];

// Minimal fake transaction that records what was written to the ledger and the
// balance, and lets the test control whether the ledger insert "conflicted".
function makeTx(ledgerReturning: { id: number }[]) {
  const captured: { ledgerValues?: any; balanceValues?: any; balanceUpserted?: boolean } = {};
  const tx = {
    insert(table: unknown) {
      return {
        values(v: any) {
          if (table === PointTransactions) {
            captured.ledgerValues = v;
            return { onConflictDoNothing: () => ({ returning: () => Promise.resolve(ledgerReturning) }) };
          }
          if (table === UserRewardBalance) {
            captured.balanceValues = v;
            return { onConflictDoUpdate: () => { captured.balanceUpserted = true; return Promise.resolve(); } };
          }
          throw new Error('unexpected table');
        },
      };
    },
  };
  return { captured, tx: tx as unknown as RecordTx };
}

describe('recordPointTransaction — per-operation invariant', () => {
  it('applies: writes the SAME signed amount to the ledger and the balance', async () => {
    const { tx, captured } = makeTx([{ id: 1 }]);
    const applied = await recordPointTransaction(tx, { userId: 7, kind: 'earn_report', amount: 10 });
    expect(applied).toBe(true);
    // The ledger delta and the balance delta are identical → SUM(ledger) stays == balance.
    expect(captured.ledgerValues.amount).toBe(10);
    expect(captured.balanceValues.points).toBe(10);
    expect(captured.balanceUpserted).toBe(true);
  });

  it('duplicate idempotency key: no-op, balance left untouched (no double credit)', async () => {
    const { tx, captured } = makeTx([]); // ledger insert conflicted -> returned no rows
    const applied = await recordPointTransaction(tx, {
      userId: 7, kind: 'earn_report', amount: 10, idempotencyKey: 'report:1:earn',
    });
    expect(applied).toBe(false);
    expect(captured.balanceValues).toBeUndefined();
    expect(captured.balanceUpserted).toBeUndefined();
  });
});

describe('domain errors carry explicit codes (for KWM-019)', () => {
  it('InsufficientPointsError', () => {
    const e = new InsufficientPointsError();
    expect(e).toBeInstanceOf(Error);
    expect(e.code).toBe('INSUFFICIENT_POINTS');
    expect(e.name).toBe('InsufficientPointsError');
  });
  it('RewardUnavailableError', () => {
    const e = new RewardUnavailableError();
    expect(e.code).toBe('REWARD_UNAVAILABLE');
    expect(e.name).toBe('RewardUnavailableError');
  });
});

describe('new reward schemas (KWM-012/017)', () => {
  it('saveRewardSchema: idempotencyKey optional; amount capped', () => {
    expect(saveRewardSchema.safeParse({ recipientUserId: 3, amount: 50 }).success).toBe(true);
    expect(saveRewardSchema.safeParse({ recipientUserId: 3, amount: 50, idempotencyKey: 'k1' }).success).toBe(true);
    expect(saveRewardSchema.safeParse({ recipientUserId: 3, amount: MAX_POINTS + 1 }).success).toBe(false);
    expect(saveRewardSchema.safeParse({ recipientUserId: 3, amount: 50, idempotencyKey: '' }).success).toBe(false);
  });
  it('rewardTransactionsQuerySchema: limit bounds + cursor coercion', () => {
    expect(rewardTransactionsQuerySchema.safeParse({ limit: 20 }).success).toBe(true);
    expect(rewardTransactionsQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
    expect(rewardTransactionsQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
    const parsed = rewardTransactionsQuerySchema.safeParse({
      limit: 10, cursor: { createdAt: '2026-01-01T00:00:00.000Z', id: 5 },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.cursor?.createdAt).toBeInstanceOf(Date);
  });
  it('redeemRewardSchema: accepts 0 (redeem-all) and positives, rejects negatives', () => {
    expect(redeemRewardSchema.safeParse({ rewardId: 0 }).success).toBe(true);
    expect(redeemRewardSchema.safeParse({ rewardId: 5 }).success).toBe(true);
    expect(redeemRewardSchema.safeParse({ rewardId: -1 }).success).toBe(false);
  });
});
