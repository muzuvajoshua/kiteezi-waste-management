import { describe, it, expect } from 'vitest';
import { InMemoryReportRepository } from '../infrastructure/in-memory-report-repository.adapter';
import { listRecentReports } from './list-recent-reports.usecase';

function report(id: number, createdAt: Date) {
  return {
    id,
    userId: 7,
    location: 'Zone 1',
    wasteType: 'general' as const,
    amount: '5',
    imageUrl: null,
    verificationResult: null,
    status: 'pending' as const,
    createdAt,
    collectorId: null,
    reviewReason: null,
  };
}

describe('listRecentReports', () => {
  it('returns the most recent reports first, limited', async () => {
    const repository = new InMemoryReportRepository();
    repository.seed(report(1, new Date('2026-01-01')));
    repository.seed(report(2, new Date('2026-01-03')));
    repository.seed(report(3, new Date('2026-01-02')));

    const result = await listRecentReports(repository, 2);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.map((r) => r.id)).toEqual([2, 3]);
  });
});
