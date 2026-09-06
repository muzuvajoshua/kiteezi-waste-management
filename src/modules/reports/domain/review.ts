import type { ReportStatus } from './report';

// KWM-032 — the supervisor's triage decision.
//
// A review is narrower than a status change. `updateReportStatus` accepts any
// ReportStatus because it predates any notion of who is changing what; a
// review may only decide, and deciding means approving or rejecting. Letting
// a reviewer set `collected` or `verified` would credit a collection that
// never happened, which is the collector's transition to make.
//
// Lives in Domain, not in the use-case, because both rules below are business
// rules rather than input validation: they hold whoever calls, and they are
// the two things a reviewer can get wrong. See KWM-081 for the full
// transition table — this is deliberately only the reviewer's half of it.
export const REVIEW_DECISIONS = ['approved', 'rejected'] as const;

export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

export function isReviewDecision(status: ReportStatus): status is ReviewDecision {
  return (REVIEW_DECISIONS as readonly ReportStatus[]).includes(status);
}

// A narrow local Result rather than shared/application's: Domain must not
// depend on the Application layer, matching the rest of this module.
export type ReasonResult =
  | { readonly ok: true; readonly value: string | null }
  | { readonly ok: false; readonly error: string };

/**
 * Normalises the reason attached to a review, enforcing that a rejection
 * carries one.
 *
 * A rejected report that says nothing is a support ticket: the citizen sees it
 * turn red and has no idea what to fix. Approval notes are optional, so an
 * absent or blank one resolves to null rather than being stored as `""`.
 *
 * The emptiness check is on the TRIMMED value on purpose. A form posting an
 * untouched textarea sends `""` or `" "`, and accepting that would leave the
 * rule technically present and practically absent.
 */
export function normaliseReviewReason(
  decision: ReviewDecision,
  reason: string | null | undefined
): ReasonResult {
  const trimmed = reason?.trim() ?? '';

  if (decision === 'rejected' && trimmed === '') {
    return { ok: false, error: 'A reason is required when rejecting a report' };
  }

  return { ok: true, value: trimmed === '' ? null : trimmed };
}
