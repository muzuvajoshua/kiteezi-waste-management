import { describe, it, expect } from 'vitest';
import { InMemoryCollectedWasteRepository } from '../infrastructure/in-memory-collected-waste-repository.adapter';
import { listMyCollectedWastes } from './list-my-collected-wastes.usecase';

describe('listMyCollectedWastes', () => {
  it('returns only the collections for the given collector', async () => {
    const repository = new InMemoryCollectedWasteRepository();
    repository.seed({ id: 1, reportId: 10, collectorId: 7, collectionDate: new Date(), status: 'collected' });
    repository.seed({ id: 2, reportId: 11, collectorId: 8, collectionDate: new Date(), status: 'collected' });

    const result = await listMyCollectedWastes(repository, 7);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.map((c) => c.id)).toEqual([1]);
  });
});
