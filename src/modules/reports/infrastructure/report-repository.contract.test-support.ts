import { describe, it, expect } from 'vitest';
import type { Report } from '../domain/report';
import type { ReportRepository } from '../application/ports/report-repository.port';

export interface ReportRepositoryContractHarness {
  readonly repository: ReportRepository;
  seedReport(report: Report): Promise<void>;
}

// Shared behavioral contract for any ReportRepository implementation. Two
// files invoke it: in-memory-…adapter.test.ts with the fake, and
// drizzle-…adapter.test.ts against a real Postgres (KWM-063). Both run these
// same assertions, which is what stops the fake drifting from the
// implementation it stands in for.
//
// KWM-063 also made this a `.test-support.ts` module. It used to be a
// `.contract.test.ts` that both defined the contract AND ran it against the
// fake at import time, so a second file importing the function would re-run
// the whole in-memory suite inside itself.
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
      reviewReason: null,
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

    // KWM-032 — bulk review.
    describe('reviewMany', () => {
      it('applies the decision to every named pending report', async () => {
        const { repository, seedReport } = createHarness();
        await seedReport(base);
        await seedReport({ ...base, id: 2 });

        const reviewed = await repository.reviewMany({
          reportIds: [1, 2],
          decision: 'approved',
          reviewReason: null,
        });

        expect(reviewed.map((r) => r.id).sort()).toEqual([1, 2]);
        expect(reviewed.every((r) => r.status === 'approved')).toBe(true);
      });

      it('stores the reason on each reviewed report', async () => {
        const { repository, seedReport } = createHarness();
        await seedReport(base);
        await seedReport({ ...base, id: 2 });

        const reviewed = await repository.reviewMany({
          reportIds: [1, 2],
          decision: 'rejected',
          reviewReason: 'Photo is unclear',
        });

        expect(reviewed.every((r) => r.reviewReason === 'Photo is unclear')).toBe(true);
      });

      it('leaves reports it was not asked about alone', async () => {
        const { repository, seedReport } = createHarness();
        await seedReport(base);
        await seedReport({ ...base, id: 2 });

        await repository.reviewMany({
          reportIds: [1],
          decision: 'approved',
          reviewReason: null,
        });

        const untouched = (await repository.findPending()).find((r) => r.id === 2);
        expect(untouched).toMatchObject({ status: 'pending', reviewReason: null });
      });

      // Two supervisors working the same inbox will send overlapping batches.
      // The second must not overturn the first's decision, and must report
      // only what it actually changed.
      it('skips reports that are no longer pending', async () => {
        const { repository, seedReport } = createHarness();
        await seedReport(base);
        await seedReport({ ...base, id: 2, status: 'approved' });

        const reviewed = await repository.reviewMany({
          reportIds: [1, 2],
          decision: 'rejected',
          reviewReason: 'Duplicate',
        });

        expect(reviewed.map((r) => r.id)).toEqual([1]);
      });

      it('does not overwrite an already-decided report\'s status', async () => {
        const { repository, seedReport } = createHarness();
        await seedReport({ ...base, status: 'approved' });

        await repository.reviewMany({
          reportIds: [1],
          decision: 'rejected',
          reviewReason: 'Duplicate',
        });

        const [report] = await repository.findByUserId(base.userId);
        expect(report.status).toBe('approved');
      });

      it('returns the reviewed reports in the order they were asked for', async () => {
        // Both implementations must agree on this or a caller that renders
        // the batch would list it differently depending on the adapter.
        // Postgres returns updated rows in whatever order it touched them, so
        // the Drizzle adapter has to impose this explicitly; the ids here are
        // deliberately not ascending, since an ascending request would be
        // satisfied by accident.
        const { repository, seedReport } = createHarness();
        for (const id of [1, 2, 3, 4]) await seedReport({ ...base, id });

        const reviewed = await repository.reviewMany({
          reportIds: [3, 1, 4],
          decision: 'approved',
          reviewReason: null,
        });

        expect(reviewed.map((r) => r.id)).toEqual([3, 1, 4]);
      });

      it('resolves to an empty list when nothing matched', async () => {
        const { repository } = createHarness();

        expect(
          await repository.reviewMany({
            reportIds: [999],
            decision: 'approved',
            reviewReason: null,
          })
        ).toEqual([]);
      });

      it('resolves to an empty list for an empty selection', async () => {
        // A guard against the empty-IN pitfall: `WHERE id IN ()` is a syntax
        // error in Postgres, and a naive builder can emit `WHERE false` — or,
        // worse, drop the predicate and review the entire table.
        const { repository, seedReport } = createHarness();
        await seedReport(base);

        expect(
          await repository.reviewMany({
            reportIds: [],
            decision: 'approved',
            reviewReason: null,
          })
        ).toEqual([]);

        expect(await repository.findPending()).toHaveLength(1);
      });
    });
  });
}
