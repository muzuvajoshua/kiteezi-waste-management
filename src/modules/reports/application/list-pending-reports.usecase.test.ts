import { describe, it, expect } from 'vitest';
import { InMemoryReportRepository } from '../infrastructure/in-memory-report-repository.adapter';
import { listPendingReports } from './list-pending-reports.usecase';

function report(id: number, status: 'pending' | 'approved') {
  return {
    id,
    userId: 7,
    location: 'Zone 1',
    wasteType: 'general' as const,
    amount: '5',
    imageUrl: null,
    verificationResult: null,
    status,
    createdAt: new Date(),
    collectorId: null,
  };
}

describe('listPendingReports', () => {
  it('returns only reports with status pending', async () => {
    const repository = new InMemoryReportRepository();
    repository.seed(report(1, 'pending'));
    repository.seed(report(2, 'approved'));

    const result = await listPendingReports(repository);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.map((r) => r.id)).toEqual([1]);
  });
});
