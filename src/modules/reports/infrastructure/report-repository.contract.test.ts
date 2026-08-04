import { describe, it, expect } from 'vitest';
import type { Report } from '../domain/report';
import type { ReportRepository } from '../application/ports/report-repository.port';
import { InMemoryReportRepository } from './in-memory-report-repository.adapter';

export interface ReportRepositoryContractHarness {
  readonly repository: ReportRepository;
  seedReport(report: Report): Promise<void>;
}

// Shared behavioral contract for any ReportRepository implementation. Run
// here against the in-memory fake; re-run against DrizzleReportRepository
// once a live/staging Postgres is available in CI (KWM-063) — intentionally
// NOT wired up yet, matching the rewards/auth/notifications modules'
// contract tests (no live DB in this environment).
export function testReportRepositoryContract(
  name: string,
  createHarness: () => ReportRepositoryContractHarness
): void {
  describe(`ReportRepository contract: ${name}`, () => {
    const base: Report = {
      id: 1,
      userId: 7,
      location: 'Zone 1',
      wasteType: 'general',
      amount: '5',
      imageUrl: null,
      verificationResult: null,
      status: 'pending',
      createdAt: new Date('2026-01-01'),
      collectorId: null,
    };

    it('findByUserId returns only that user\'s reports', async () => {
      const { repository, seedReport } = createHarness();
      await seedReport(base);
      await seedReport({ ...base, id: 2, userId: 8 });

      const found = await repository.findByUserId(7);
      expect(found.map((r) => r.id)).toEqual([1]);
    });

    it('findPending returns only reports with status pending', async () => {
      const { repository, seedReport } = createHarness();
      await seedReport(base);
      await seedReport({ ...base, id: 2, status: 'approved' });

      const found = await repository.findPending();
      expect(found.map((r) => r.id)).toEqual([1]);
    });

    it('updateStatus updates status and, when given, collectorId', async () => {
      const { repository, seedReport } = createHarness();
      await seedReport(base);

      const updated = await repository.updateStatus(1, 'collected', { collectorId: 42 });
      expect(updated).toMatchObject({ status: 'collected', collectorId: 42 });
    });

    it('updateStatus without opts leaves collectorId untouched', async () => {
      const { repository, seedReport } = createHarness();
      await seedReport({ ...base, collectorId: 9 });

      const updated = await repository.updateStatus(1, 'approved');
      expect(updated).toMatchObject({ status: 'approved', collectorId: 9 });
    });

    it('updateStatus resolves to null for a missing report', async () => {
      const { repository } = createHarness();
      expect(await repository.updateStatus(999, 'approved')).toBeNull();
    });
  });
}

testReportRepositoryContract('InMemoryReportRepository', () => {
  const repository = new InMemoryReportRepository();
  return {
    repository,
    seedReport: async (report) => repository.seed(report),
  };
});
