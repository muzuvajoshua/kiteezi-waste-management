import { describe, it, expect } from 'vitest';
import { InMemoryReportRepository } from '../infrastructure/in-memory-report-repository.adapter';
import { updateReportStatus } from './update-report-status.usecase';

describe('updateReportStatus', () => {
  it('updates the status without touching collectorId', async () => {
    const repository = new InMemoryReportRepository();
    repository.seed({
      id: 1,
      userId: 7,
      location: 'Zone 1',
      wasteType: 'general',
      amount: '5',
      imageUrl: null,
      verificationResult: null,
      status: 'pending',
      createdAt: new Date(),
      collectorId: null,
    });

    const result = await updateReportStatus(repository, 1, 'approved');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({ status: 'approved', collectorId: null });
    }
  });

  it('resolves to null when the report does not exist', async () => {
    const repository = new InMemoryReportRepository();
    const result = await updateReportStatus(repository, 999, 'approved');
    expect(result).toEqual({ ok: true, value: null });
  });
});
