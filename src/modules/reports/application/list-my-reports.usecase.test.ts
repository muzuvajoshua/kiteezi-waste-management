import { describe, it, expect } from 'vitest';
import { InMemoryReportRepository } from '../infrastructure/in-memory-report-repository.adapter';
import { listMyReports } from './list-my-reports.usecase';

function report(id: number, userId: number) {
  return {
    id,
    userId,
    location: 'Zone 1',
    wasteType: 'general' as const,
    amount: '5',
    imageUrl: null,
    verificationResult: null,
    status: 'pending' as const,
    createdAt: new Date(),
    collectorId: null,
  };
}

describe('listMyReports', () => {
  it('returns only the reports for the given user', async () => {
    const repository = new InMemoryReportRepository();
    repository.seed(report(1, 7));
    repository.seed(report(2, 8));

    const result = await listMyReports(repository, 7);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.map((r) => r.id)).toEqual([1]);
  });
});
