import { describe, it, expect } from 'vitest';
import { InMemoryReportRepository } from '../infrastructure/in-memory-report-repository.adapter';
import { updateTaskStatus } from './update-task-status.usecase';

describe('updateTaskStatus', () => {
  it('updates the status and claims the report for the acting collector', async () => {
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
      createdAt: new Date(),
      collectorId: null,
      reviewReason: null,
    });

    const result = await updateTaskStatus(repository, 1, 'collected', 42);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({ status: 'collected', collectorId: 42 });
    }
  });

  it('resolves to null when the report does not exist', async () => {
    const repository = new InMemoryReportRepository();
    const result = await updateTaskStatus(repository, 999, 'collected', 42);
    expect(result).toEqual({ ok: true, value: null });
  });
});
