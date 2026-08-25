import { describe, it, expect, vi, afterEach } from 'vitest';
import { ok, err } from '@/shared/application/result';
import { appError } from '@/shared/application/app-error';
import { DomainError } from '@/shared/domain/domain-error';
import { ValidationError } from '@/lib/validation';
import { z } from 'zod';
import { actionResult } from './action-result';

// KWM-019 — the server-action boundary.
//
// Every action's contract is "returns Result, never throws". This helper is
// what makes that true, so these tests are the specification for how each
// failure mode reaches the client.

class UnauthenticatedLike extends DomainError {
  readonly code = 'UNAUTHENTICATED' as const;
  constructor() {
    super('Not authenticated');
  }
}

class ForbiddenLike extends DomainError {
  readonly code = 'FORBIDDEN' as const;
  constructor() {
    super('Insufficient permissions');
  }
}

class InsufficientPointsLike extends DomainError {
  readonly code = 'INSUFFICIENT_POINTS' as const;
  constructor() {
    super('Insufficient points for this redemption');
  }
}

function validationError(): ValidationError {
  const parsed = z.object({ amount: z.number() }).safeParse({ amount: 'ten' });
  if (parsed.success) throw new Error('fixture should not parse');
  return new ValidationError(parsed.error);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('actionResult', () => {
  describe('passes a use-case Result straight through', () => {
    it('returns an ok Result unchanged', async () => {
      expect(await actionResult(async () => ok(42))).toEqual({ ok: true, value: 42 });
    });

    it('returns an err Result unchanged, preserving its code and message', async () => {
      const result = await actionResult(async () => err(appError('NOT_FOUND', 'No such report')));

      expect(result).toEqual({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'No such report' },
      });
    });

    it('does not log when a use-case returns an expected failure', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await actionResult(async () => err(appError('NOT_FOUND', 'No such report')));

      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('maps thrown guard failures onto the boundary', () => {
    it('maps an unauthenticated caller to UNAUTHENTICATED', async () => {
      const result = await actionResult(async () => {
        throw new UnauthenticatedLike();
      });

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'UNAUTHENTICATED', message: 'Not authenticated' },
      });
    });

    it('maps a forbidden caller to FORBIDDEN', async () => {
      const result = await actionResult(async () => {
        throw new ForbiddenLike();
      });

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'FORBIDDEN', message: 'Insufficient permissions' },
      });
    });
  });

  describe('maps thrown validation failures', () => {
    it('maps a ValidationError to VALIDATION and keeps the field detail', async () => {
      const result = await actionResult(async () => {
        throw validationError();
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('VALIDATION');
      // The message names the offending field, so a toast is actionable
      // rather than a bare "invalid input".
      expect(result.error.message).toContain('amount');
    });
  });

  describe('maps thrown domain errors', () => {
    it('maps a business-rule violation to CONFLICT, preserving the domain code', async () => {
      const result = await actionResult(async () => {
        throw new InsufficientPointsLike();
      });

      expect(result).toMatchObject({
        ok: false,
        error: {
          code: 'CONFLICT',
          domainCode: 'INSUFFICIENT_POINTS',
          message: 'Insufficient points for this redemption',
        },
      });
    });
  });

  describe('contains unexpected faults', () => {
    it('maps an unknown error to UNEXPECTED', async () => {
      const result = await actionResult(async () => {
        throw new Error('connect ECONNREFUSED 10.0.0.5:5432 password=hunter2');
      });

      expect(result).toMatchObject({ ok: false, error: { code: 'UNEXPECTED' } });
    });

    it('does not leak the underlying message to the client', async () => {
      // Action return values cross to the browser. An unexpected fault's
      // message can carry connection strings, credentials or SQL, so the
      // client gets a generic message and the detail stays server-side.
      vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await actionResult(async () => {
        throw new Error('connect ECONNREFUSED 10.0.0.5:5432 password=hunter2');
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).not.toContain('hunter2');
      expect(result.error.message).not.toContain('10.0.0.5');
    });

    it('logs the unexpected fault server-side so it is not silently swallowed', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const thrown = new Error('boom');

      await actionResult(async () => {
        throw thrown;
      });

      expect(spy).toHaveBeenCalled();
      expect(spy.mock.calls[0]).toContain(thrown);
    });

    it('handles a thrown non-Error value', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await actionResult(async () => {
        throw 'a string, because JavaScript';
      });

      expect(result).toMatchObject({ ok: false, error: { code: 'UNEXPECTED' } });
    });
  });

  describe('never throws', () => {
    it('resolves rather than rejecting for every failure mode', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});

      const thrower = (error: unknown) => async () => {
        throw error;
      };

      await expect(actionResult(thrower(new UnauthenticatedLike()))).resolves.toBeDefined();
      await expect(actionResult(thrower(new ForbiddenLike()))).resolves.toBeDefined();
      await expect(actionResult(thrower(validationError()))).resolves.toBeDefined();
      await expect(actionResult(thrower(new InsufficientPointsLike()))).resolves.toBeDefined();
      await expect(actionResult(thrower(new Error('boom')))).resolves.toBeDefined();
      await expect(actionResult(thrower(undefined))).resolves.toBeDefined();
    });
  });
});
