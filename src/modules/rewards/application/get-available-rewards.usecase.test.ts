import { describe, it, expect } from 'vitest';
import { InMemoryRewardRepository } from '../infrastructure/in-memory-reward-repository.adapter';
import { InMemoryRewardCatalogRepository } from '../infrastructure/in-memory-reward-catalog-repository.adapter';
import { getAvailableRewards } from './get-available-rewards.usecase';

describe('getAvailableRewards', () => {
  it('returns the balance and only the available catalog items', async () => {
    const rewardRepository = new InMemoryRewardRepository();
    rewardRepository.seedBalance(7, 30);
    const catalogRepository = new InMemoryRewardCatalogRepository();
    catalogRepository.seed({ id: 1, name: 'Bag', description: null, costPoints: 20, isAvailable: true });
    catalogRepository.seed({ id: 2, name: 'Mug', description: 'A mug', costPoints: 15, isAvailable: false });

    const result = await getAvailableRewards(rewardRepository, catalogRepository, 7);

    expect(result).toEqual({
      ok: true,
      value: {
        balance: 30,
        items: [{ id: 1, name: 'Bag', description: null, costPoints: 20 }],
      },
    });
  });
});
