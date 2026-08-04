import { describe, it, expect } from 'vitest';
import { RewardCatalogItem } from './reward-catalog-item';
import { RewardUnavailableError } from './errors';

const baseProps = { id: 1, name: 'Reusable bag', description: null, costPoints: 20, isAvailable: true };

describe('RewardCatalogItem', () => {
  it('exposes the underlying fields', () => {
    const item = RewardCatalogItem.from(baseProps);
    expect(item.id).toBe(1);
    expect(item.name).toBe('Reusable bag');
    expect(item.costPoints).toBe(20);
    expect(item.isAvailable).toBe(true);
  });

  it('assertRedeemable does not throw when available', () => {
    const item = RewardCatalogItem.from(baseProps);
    expect(() => item.assertRedeemable()).not.toThrow();
  });

  it('assertRedeemable throws RewardUnavailableError when unavailable', () => {
    const item = RewardCatalogItem.from({ ...baseProps, isAvailable: false });
    expect(() => item.assertRedeemable()).toThrow(RewardUnavailableError);
  });
});
