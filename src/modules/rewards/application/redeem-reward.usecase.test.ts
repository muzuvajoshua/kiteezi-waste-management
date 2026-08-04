import { describe, it, expect } from 'vitest';
import { InMemoryRewardTransactionManager } from '../infrastructure/in-memory-reward-ledger-unit-of-work.adapter';
import { InMemoryRewardCatalogRepository } from '../infrastructure/in-memory-reward-catalog-repository.adapter';
import { redeemReward } from './redeem-reward.usecase';

function setup() {
  const txManager = new InMemoryRewardTransactionManager();
  const catalog = new InMemoryRewardCatalogRepository();
  return { txManager, catalog };
}

describe('redeemReward — specific catalog item', () => {
  it('redeems and returns the new balance', async () => {
    const { txManager, catalog } = setup();
    txManager.seedBalance(7, 50);
    catalog.seed({ id: 1, name: 'Bag', description: null, costPoints: 20, isAvailable: true });

    const result = await redeemReward(txManager, catalog, { userId: 7, rewardId: 1 });

    expect(result).toEqual({ ok: true, value: { balance: 30 } });
    expect(txManager.balances.get(7)).toBe(30);
    expect(txManager.transactions[0]).toMatchObject({ kind: 'redeem', amount: -20, relatedRedemptionId: 1 });
  });

  it('maps insufficient balance to a CONFLICT AppError', async () => {
    const { txManager, catalog } = setup();
    txManager.seedBalance(7, 10);
    catalog.seed({ id: 1, name: 'Bag', description: null, costPoints: 20, isAvailable: true });

    const result = await redeemReward(txManager, catalog, { userId: 7, rewardId: 1 });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('CONFLICT');
      expect(result.error.domainCode).toBe('INSUFFICIENT_POINTS');
    }
    expect(txManager.balances.get(7)).toBe(10); // untouched
  });

  it('maps an unavailable item to a CONFLICT AppError', async () => {
    const { txManager, catalog } = setup();
    txManager.seedBalance(7, 50);
    catalog.seed({ id: 1, name: 'Bag', description: null, costPoints: 20, isAvailable: false });

    const result = await redeemReward(txManager, catalog, { userId: 7, rewardId: 1 });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.domainCode).toBe('REWARD_UNAVAILABLE');
  });

  it('treats a missing item the same as unavailable', async () => {
    const { txManager, catalog } = setup();
    txManager.seedBalance(7, 50);

    const result = await redeemReward(txManager, catalog, { userId: 7, rewardId: 999 });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.domainCode).toBe('REWARD_UNAVAILABLE');
  });
});

describe('redeemReward — redeem-all (rewardId 0)', () => {
  it('drains the balance to zero', async () => {
    const { txManager, catalog } = setup();
    txManager.seedBalance(7, 35);

    const result = await redeemReward(txManager, catalog, { userId: 7, rewardId: 0 });

    expect(result).toEqual({ ok: true, value: { balance: 0 } });
    expect(txManager.transactions[0]).toMatchObject({ kind: 'redeem', amount: -35 });
  });

  it('is a no-op when the balance is already zero', async () => {
    const { txManager, catalog } = setup();
    txManager.seedBalance(7, 0);

    const result = await redeemReward(txManager, catalog, { userId: 7, rewardId: 0 });

    expect(result).toEqual({ ok: true, value: { balance: 0 } });
    expect(txManager.transactions).toHaveLength(0);
  });
});
