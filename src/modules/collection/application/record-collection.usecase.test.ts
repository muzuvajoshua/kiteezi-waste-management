import { describe, it, expect } from 'vitest';
import { InMemoryCollectedWasteRepository } from '../infrastructure/in-memory-collected-waste-repository.adapter';
import { recordCollection } from './record-collection.usecase';

describe('recordCollection', () => {
  it('records a collection with the given status', async () => {
    const repository = new InMemoryCollectedWasteRepository();

    const result = await recordCollection(repository, { reportId: 10, collectorId: 7, status: 'collected' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({ reportId: 10, collectorId: 7, status: 'collected' });
    }
    expect(await repository.findByCollectorId(7)).toHaveLength(1);
  });

  it('records a verified collection (saveCollectedWaste shape)', async () => {
    const repository = new InMemoryCollectedWasteRepository();

    const result = await recordCollection(repository, { reportId: 11, collectorId: 7, status: 'verified' });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.status).toBe('verified');
  });
});
