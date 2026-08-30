import { describe, it, expect } from 'vitest';
import { appError } from '@/shared/application/app-error';
import { actionErrorMessage } from './action-error';

// KWM-019 AC3 — the UI branches on `.code`. This is the mapping it uses, kept
// out of components so `/report` and `/my-reports` share one vocabulary.

describe('actionErrorMessage', () => {
  it('asks an unauthenticated user to sign in', () => {
    expect(actionErrorMessage(appError('UNAUTHENTICATED', 'Not authenticated'))).toBe(
      'Please sign in to continue.'
    );
  });

  it('keeps a sign-in failure message instead of telling them to sign in', () => {
    // The sign-in form itself returns UNAUTHENTICATED for bad credentials.
    // Rewriting that to "Please sign in to continue." is nonsense on the very
    // form they are signing in with, so an explicit `signIn` context opts out
    // of the rewrite. The credential message is deliberately vague already —
    // it never distinguishes a wrong password from an unknown address.
    expect(
      actionErrorMessage(appError('UNAUTHENTICATED', 'Incorrect email address or password.'), {
        context: 'signIn',
      })
    ).toBe('Incorrect email address or password.');
  });

  it('falls back to a generic sign-in message when the server sent none', () => {
    expect(actionErrorMessage(appError('UNAUTHENTICATED', ''), { context: 'signIn' })).toBe(
      'Incorrect email address or password.'
    );
  });

  it('still hides raw fault text in sign-in context', () => {
    expect(
      actionErrorMessage(
        { code: 'UNEXPECTED', message: 'ECONNREFUSED password=hunter2' },
        { context: 'signIn' }
      )
    ).toBe('Something went wrong. Please try again.');
  });

  it('tells a forbidden user they lack permission', () => {
    expect(actionErrorMessage(appError('FORBIDDEN', 'Insufficient permissions'))).toBe(
      "You don't have permission to do that."
    );
  });

  it('surfaces the server message for a validation failure', () => {
    // The server message names the offending field, which is the whole point
    // of showing it rather than a generic "invalid input".
    expect(actionErrorMessage(appError('VALIDATION', 'amount: Expected number'))).toBe(
      'amount: Expected number'
    );
  });

  it('surfaces the server message for a conflict', () => {
    expect(
      actionErrorMessage(appError('CONFLICT', 'Insufficient points for this redemption'))
    ).toBe('Insufficient points for this redemption');
  });

  it('passes the rate-limit message through, since it says how long to wait', () => {
    expect(
      actionErrorMessage(appError('RATE_LIMITED', 'Too many attempts. Please try again in 42 seconds.'))
    ).toBe('Too many attempts. Please try again in 42 seconds.');
  });

  it('falls back to a usable message when a rate-limit error carries none', () => {
    expect(actionErrorMessage(appError('RATE_LIMITED', ''))).toMatch(/too many attempts/i);
  });

  it('reports a not-found plainly', () => {
    expect(actionErrorMessage(appError('NOT_FOUND', 'No such report'))).toBe('No such report');
  });

  it('uses a generic message for an unexpected fault', () => {
    // actionResult already replaced the underlying message server-side; this
    // guarantees the UI never shows raw fault text even if that changes.
    expect(
      actionErrorMessage({ code: 'UNEXPECTED', message: 'connect ECONNREFUSED password=hunter2' })
    ).toBe('Something went wrong. Please try again.');
  });

  it('falls back to a generic message when the server message is blank', () => {
    expect(actionErrorMessage(appError('CONFLICT', ''))).toBe(
      'Something went wrong. Please try again.'
    );
  });

  it('never returns an empty string', () => {
    const codes = [
      'VALIDATION',
      'NOT_FOUND',
      'UNAUTHENTICATED',
      'FORBIDDEN',
      'CONFLICT',
      'RATE_LIMITED',
      'UNEXPECTED',
    ] as const;

    for (const code of codes) {
      expect(actionErrorMessage(appError(code, '')).length).toBeGreaterThan(0);
    }
  });
});
