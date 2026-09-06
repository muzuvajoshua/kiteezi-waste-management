import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryReportRepository } from '../infrastructure/in-memory-report-repository.adapter';
import type { Report, ReportStatus } from '../domain/report';
import { reviewReports } from './review-reports.usecase';

// KWM-032 — a supervisor deciding a batch of pending reports.
//
// The use-case owns the boundary between "what the client sent" and "what the
// repository may be asked to do". `decision` arrives as a plain string from a
// form, so it is checked here rather than trusted, and the rejection-needs-a-
// reason rule is applied through the domain.

let repository: InMemoryReportRepository;

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

function seed(...reports: readonly Partial<Report>[]) {
  for (const over of reports) repository.seed({ ...base, ...over });
}

beforeEach(() => {
  repository = new InMemoryReportRepository();
});

describe('reviewReports', () => {
  describe('approving', () => {
    it('returns the reports it approved', async () => {
      seed({ id: 1 }, { id: 2 });

      const result = await reviewReports(repository, {
        reportIds: [1, 2],
        decision: 'approved',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.map((r) => r.id)).toEqual([1, 2]);
        expect(result.value.every((r) => r.status === 'approved')).toBe(true);
      }
    });

    it('needs no reason', async () => {
      seed({ id: 1 });

      const result = await reviewReports(repository, { reportIds: [1], decision: 'approved' });

      expect(result).toMatchObject({ ok: true });
    });

    it('stores an optional note when one is given', async () => {
      seed({ id: 1 });

      const result = await reviewReports(repository, {
        reportIds: [1],
        decision: 'approved',
        reviewReason: '  Clear photo  ',
      });

      expect(result.ok && result.value[0].reviewReason).toBe('Clear photo');
    });
  });

  describe('rejecting', () => {
    it('stores the trimmed reason', async () => {
      seed({ id: 1 });

      const result = await reviewReports(repository, {
        reportIds: [1],
        decision: 'rejected',
        reviewReason: '  Photo is unclear  ',
      });

      expect(result.ok && result.value[0]).toMatchObject({
        status: 'rejected',
        reviewReason: 'Photo is unclear',
      });
    });

    it('refuses without a reason', async () => {
      seed({ id: 1 });

      const result = await reviewReports(repository, { reportIds: [1], decision: 'rejected' });

      expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    });

    it('refuses a blank reason', async () => {
      seed({ id: 1 });

      const result = await reviewReports(repository, {
        reportIds: [1],
        decision: 'rejected',
        reviewReason: '   ',
      });

      expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    });

    it('changes nothing when it refuses', async () => {
      // The check must happen before the write, not alongside it.
      seed({ id: 1 });

      await reviewReports(repository, { reportIds: [1], decision: 'rejected' });

      expect((await repository.findPending()).map((r) => r.id)).toEqual([1]);
    });
  });

  describe('what a review may decide', () => {
    // `decision` crosses from a form as a string, so a caller can ask for
    // anything. Reaching `collected` or `verified` here would credit a
    // collection that never happened.
    it.each(['pending', 'in_progress', 'collected', 'verified'] as const)(
      'refuses %s',
      async (status) => {
        seed({ id: 1 });

        const result = await reviewReports(repository, {
          reportIds: [1],
          decision: status as ReportStatus,
          reviewReason: 'because',
        });

        expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
      }
    );

    it('refuses a status that is not a status at all', async () => {
      seed({ id: 1 });

      const result = await reviewReports(repository, {
        reportIds: [1],
        decision: 'banana' as ReportStatus,
        reviewReason: 'because',
      });

      expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    });

    it('changes nothing when the decision is refused', async () => {
      seed({ id: 1 });

      await reviewReports(repository, {
        reportIds: [1],
        decision: 'collected' as ReportStatus,
        reviewReason: 'because',
      });

      expect((await repository.findPending()).map((r) => r.id)).toEqual([1]);
    });
  });

  describe('the selection', () => {
    it('refuses an empty selection', async () => {
      // Approving nothing is a mistake, not a no-op: it means the supervisor
      // pressed the button with nothing ticked and should be told so.
      const result = await reviewReports(repository, { reportIds: [], decision: 'approved' });

      expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    });

    it('refuses a duplicated id rather than counting it twice', async () => {
      seed({ id: 1 });

      const result = await reviewReports(repository, {
        reportIds: [1, 1],
        decision: 'approved',
      });

      expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    });

    it('resolves ok with fewer reports when some were already decided', async () => {
      // Not an error. Two supervisors working the same inbox overlap, and the
      // honest answer is "one of these two changed", not a failure.
      seed({ id: 1 }, { id: 2, status: 'approved' });

      const result = await reviewReports(repository, {
        reportIds: [1, 2],
        decision: 'rejected',
        reviewReason: 'Duplicate',
      });

      expect(result.ok && result.value.map((r) => r.id)).toEqual([1]);
    });

    it('resolves ok and empty when every id was already decided', async () => {
      seed({ id: 1, status: 'approved' });

      const result = await reviewReports(repository, {
        reportIds: [1],
        decision: 'rejected',
        reviewReason: 'Duplicate',
      });

      expect(result).toEqual({ ok: true, value: [] });
    });
  });

  describe('when the repository fails', () => {
    it('reports UNEXPECTED rather than throwing', async () => {
      const failing = {
        ...repository,
        reviewMany: async () => {
          throw new Error('connection reset');
        },
      } as unknown as InMemoryReportRepository;

      const result = await reviewReports(failing, { reportIds: [1], decision: 'approved' });

      expect(result).toMatchObject({ ok: false, error: { code: 'UNEXPECTED' } });
    });
  });
});
