import { describe, it, expect } from 'vitest';
import { REVIEW_DECISIONS, isReviewDecision, normaliseReviewReason } from './review';

// KWM-032 — the supervisor's triage decision.
//
// Two rules, both here rather than in the use-case: a review may only move a
// report to a decided state, and a rejection must say why. The second is the
// one that matters to a citizen — a report that simply turns red with no
// explanation is a support ticket.

describe('review decisions', () => {
  it('admits exactly approved and rejected', () => {
    expect([...REVIEW_DECISIONS]).toEqual(['approved', 'rejected']);
  });

  it.each(['approved', 'rejected'] as const)('%s is a review decision', (status) => {
    expect(isReviewDecision(status)).toBe(true);
  });

  // A review must not be able to skip a report straight to collected or
  // verified: those are the collector's transitions, and reaching them here
  // would credit a collection that never happened.
  it.each(['pending', 'in_progress', 'collected', 'verified'] as const)(
    '%s is not a review decision',
    (status) => {
      expect(isReviewDecision(status)).toBe(false);
    }
  );
});

describe('normaliseReviewReason', () => {
  describe('rejecting', () => {
    it('keeps a trimmed reason', () => {
      expect(normaliseReviewReason('rejected', '  Photo is unclear  ')).toEqual({
        ok: true,
        value: 'Photo is unclear',
      });
    });

    it('refuses a missing reason', () => {
      expect(normaliseReviewReason('rejected', undefined)).toMatchObject({ ok: false });
    });

    it('refuses a null reason', () => {
      expect(normaliseReviewReason('rejected', null)).toMatchObject({ ok: false });
    });

    it('refuses a reason that is only whitespace', () => {
      // The check has to be on the trimmed value, not on presence. A form
      // that posts an untouched text field sends "" or " ", and treating
      // that as given is the same as having no rule at all.
      expect(normaliseReviewReason('rejected', '   \n  ')).toMatchObject({ ok: false });
    });

    it('says which field is wrong', () => {
      const result = normaliseReviewReason('rejected', '');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/reason/i);
    });
  });

  describe('approving', () => {
    it('resolves to null when no reason is given', () => {
      expect(normaliseReviewReason('approved', undefined)).toEqual({ ok: true, value: null });
    });

    it('keeps a trimmed note when one is given', () => {
      // Approving with a note is allowed — it is only rejection that
      // *requires* one.
      expect(normaliseReviewReason('approved', ' Looks right ')).toEqual({
        ok: true,
        value: 'Looks right',
      });
    });

    it('resolves a whitespace-only note to null rather than storing it', () => {
      expect(normaliseReviewReason('approved', '   ')).toEqual({ ok: true, value: null });
    });
  });
});
