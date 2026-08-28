import { describe, it, expect } from 'vitest';
import { InMemoryRewardRepository } from '../infrastructure/in-memory-reward-repository.adapter';
import { getBalance } from './get-balance.usecase';

describe('getBalance', () => {
  it('returns the seeded balance', async () => {
    const repository = new InMemoryRewardRepository();
    repository.seedBalance(7, 42);

    expect(await getBalance(repository, 7)).toEqual({ ok: true, value: 42 });
  });

  it('returns 0 for a user with no balance row', async () => {
    const repository = new InMemoryRewardRepository();

    expect(await getBalance(repository, 999)).toEqual({ ok: true, value: 0 });
  });
});
