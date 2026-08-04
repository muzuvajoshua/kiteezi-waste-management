import { describe, it, expect } from 'vitest';
import { InMemoryRewardRepository } from '../infrastructure/in-memory-reward-repository.adapter';
import { getAllBalances } from './get-all-balances.usecase';

describe('getAllBalances', () => {
  it('returns balances sorted highest first, with the user name attached', async () => {
    const repository = new InMemoryRewardRepository();
    repository.seedBalance(1, 10, 'Alice');
    repository.seedBalance(2, 50, 'Bob');

    const result = await getAllBalances(repository);

    expect(result).toEqual({
      ok: true,
      value: [
        { userId: 2, points: 50, userName: 'Bob' },
        { userId: 1, points: 10, userName: 'Alice' },
      ],
    });
  });
});
