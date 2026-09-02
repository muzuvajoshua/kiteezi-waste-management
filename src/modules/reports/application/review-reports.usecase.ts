import { type Result, ok, err } from '@/shared/application/result';
import { type AppError, appError } from '@/shared/application/app-error';
import { isReviewDecision, normaliseReviewReason } from '../domain/review';
import type { Report, ReportStatus } from '../domain/report';
import type { ReportRepository } from './ports/report-repository.port';

export interface ReviewReportsInput {
  readonly reportIds: readonly number[];
  // Typed as ReportStatus, not ReviewDecision, on purpose: this value crosses
  // from a form, so the narrowing has to happen at runtime here rather than
  // being assumed by the signature.
  readonly decision: ReportStatus;
  readonly reviewReason?: string | null;
}

/**
 * Applies one supervisor decision to a batch of pending reports.
 *
 * KWM-032. Every refusal below happens *before* the write, so a rejected
 * request leaves the batch untouched rather than partly applied.
 *
 * Resolving `ok` with fewer reports than were asked for is not an error: two
 * supervisors working the same inbox send overlapping batches, and the honest
 * answer is "one of these two changed". The caller reports the count.
 */
export async function reviewReports(
  repository: ReportRepository,
  input: ReviewReportsInput
): Promise<Result<Report[], AppError>> {
  // Deciding nothing is a mistake rather than a no-op — the supervisor
  // pressed the button with nothing ticked, and should be told.
  if (input.reportIds.length === 0) {
    return err(appError('VALIDATION', 'Select at least one report to review'));
  }

  // A duplicated id would be counted twice in "N reports reviewed", which
  // misreports what happened. Refusing is better than silently deduplicating:
  // a caller sending duplicates has a bug worth surfacing.
  if (new Set(input.reportIds).size !== input.reportIds.length) {
    return err(appError('VALIDATION', 'The same report was selected more than once'));
  }

  if (!isReviewDecision(input.decision)) {
    return err(appError('VALIDATION', 'A review must either approve or reject'));
  }

  const reason = normaliseReviewReason(input.decision, input.reviewReason);
  if (!reason.ok) {
    return err(appError('VALIDATION', reason.error));
  }

  try {
    return ok(
      await repository.reviewMany({
        reportIds: input.reportIds,
        decision: input.decision,
        reviewReason: reason.value,
      })
    );
  } catch {
    return err(appError('UNEXPECTED', 'Failed to review reports'));
  }
}
