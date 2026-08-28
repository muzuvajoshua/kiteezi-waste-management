import { describe, it, expect } from 'vitest';
import { InMemoryReportRepository } from '../infrastructure/in-memory-report-repository.adapter';
import { listCollectionTasks } from './list-collection-tasks.usecase';

describe('listCollectionTasks', () => {
  it('formats the date as YYYY-MM-DD', async () => {
    const repository = new InMemoryReportRepository();
    repository.seed({
      id: 1,
      userId: 7,
      location: 'Zone 1',
      wasteType: 'general',
      amount: '5',
      imageUrl: null,
      verificationResult: null,
      status: 'approved',
      createdAt: new Date('2026-03-15T10:30:00.000Z'),
      collectorId: 3,
    });

    const result = await listCollectionTasks(repository, 10);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([
        { id: 1, location: 'Zone 1', wasteType: 'general', amount: '5', status: 'approved', date: '2026-03-15', collectorId: 3 },
      ]);
    }
  });
});
