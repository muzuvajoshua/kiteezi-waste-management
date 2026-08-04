import { describe, it, expect } from 'vitest';
import { MAX_POINTS } from '@/utils/db/schemas/common';
import { redeemRewardSchema, saveRewardSchema, rewardTransactionsQuerySchema } from './reward.schemas';

describe('redeemRewardSchema', () => {
  it('accepts 0 (redeem-all) and positive ids', () => {
    expect(redeemRewardSchema.safeParse({ rewardId: 0 }).success).toBe(true);
    expect(redeemRewardSchema.safeParse({ rewardId: 7 }).success).toBe(true);
  });
  it('rejects negative / float', () => {
    expect(redeemRewardSchema.safeParse({ rewardId: -1 }).success).toBe(false);
    expect(redeemRewardSchema.safeParse({ rewardId: 1.5 }).success).toBe(false);
  });
});

describe('saveRewardSchema', () => {
  it('accepts a valid grant, with or without an idempotency key', () => {
    expect(saveRewardSchema.safeParse({ recipientUserId: 3, amount: 50 }).success).toBe(true);
    expect(saveRewardSchema.safeParse({ recipientUserId: 3, amount: 50, idempotencyKey: 'k1' }).success).toBe(true);
  });
  it('rejects bad recipient', () => {
    expect(saveRewardSchema.safeParse({ recipientUserId: 0, amount: 50 }).success).toBe(false);
  });
  it('rejects non-positive amount', () => {
    expect(saveRewardSchema.safeParse({ recipientUserId: 3, amount: 0 }).success).toBe(false);
    expect(saveRewardSchema.safeParse({ recipientUserId: 3, amount: -10 }).success).toBe(false);
  });
  it(`rejects amount over the cap (${MAX_POINTS})`, () => {
    expect(saveRewardSchema.safeParse({ recipientUserId: 3, amount: MAX_POINTS + 1 }).success).toBe(false);
  });
  it('rejects an empty idempotency key', () => {
    expect(saveRewardSchema.safeParse({ recipientUserId: 3, amount: 50, idempotencyKey: '' }).success).toBe(false);
  });
});

describe('rewardTransactionsQuerySchema', () => {
  it('accepts limit bounds 1..100, rejects out of range', () => {
    expect(rewardTransactionsQuerySchema.safeParse({ limit: 20 }).success).toBe(true);
    expect(rewardTransactionsQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
    expect(rewardTransactionsQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
  });
  it('coerces a string cursor.createdAt into a Date', () => {
    const parsed = rewardTransactionsQuerySchema.safeParse({
      limit: 10,
      cursor: { createdAt: '2026-01-01T00:00:00.000Z', id: 5 },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.cursor?.createdAt).toBeInstanceOf(Date);
  });
});
