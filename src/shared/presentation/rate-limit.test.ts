import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InMemoryRateLimiter } from '@/shared/infrastructure/rate-limit/in-memory-rate-limiter.adapter';
import { actionResult } from './action-result';
import { ok } from '@/shared/application/result';
import { RateLimitedError, enforceRateLimit, RATE_LIMITS } from './rate-limit';

// The guard actions call. It enforces every bucket it is given and throws
// RateLimitedError, which actionResult maps onto the RATE_LIMITED AppError —
// so a limited action reports the same way every other failure does.

let now: number;
let limiter: InMemoryRateLimiter;

beforeEach(() => {
  now = 1_000_000;
  limiter = new InMemoryRateLimiter(() => now);
});

const POLICY = { limit: 2, windowSeconds: 60 };

describe('enforceRateLimit', () => {
  describe('within the limit', () => {
    it('permits the call', async () => {
      await expect(
        enforceRateLimit(limiter, [{ scope: 'signIn', id: 'a@example.com', policy: POLICY }])
      ).resolves.toBeUndefined();
    });

    it('permits repeated calls up to the limit', async () => {
      const bucket = [{ scope: 'signIn', id: 'a@example.com', policy: POLICY }];
      await enforceRateLimit(limiter, bucket);

      await expect(enforceRateLimit(limiter, bucket)).resolves.toBeUndefined();
    });
  });

  describe('beyond the limit', () => {
    it('throws RateLimitedError', async () => {
      const bucket = [{ scope: 'signIn', id: 'a@example.com', policy: POLICY }];
      await enforceRateLimit(limiter, bucket);
      await enforceRateLimit(limiter, bucket);

      await expect(enforceRateLimit(limiter, bucket)).rejects.toBeInstanceOf(RateLimitedError);
    });

    it('reports how long to wait', async () => {
      const bucket = [{ scope: 'signIn', id: 'a@example.com', policy: POLICY }];
      await enforceRateLimit(limiter, bucket);
      await enforceRateLimit(limiter, bucket);

      await enforceRateLimit(limiter, bucket).catch((error: RateLimitedError) => {
        expect(error.retryAfterSeconds).toBeGreaterThan(0);
        expect(error.message).toMatch(/try again/i);
      });
    });

    it('carries the RATE_LIMITED domain code', async () => {
      const bucket = [{ scope: 'signIn', id: 'a@example.com', policy: POLICY }];
      await enforceRateLimit(limiter, bucket);
      await enforceRateLimit(limiter, bucket);

      await enforceRateLimit(limiter, bucket).catch((error: RateLimitedError) => {
        expect(error.code).toBe('RATE_LIMITED');
      });
    });
  });

  describe('multiple buckets', () => {
    const buckets = (email: string, ip: string) => [
      { scope: 'signIn:email', id: email, policy: POLICY },
      { scope: 'signIn:ip', id: ip, policy: { limit: 10, windowSeconds: 60 } },
    ];

    it('refuses when ANY bucket is exhausted', async () => {
      // The per-email bucket is the tighter one, so a single account being
      // brute-forced trips first even from many addresses.
      await enforceRateLimit(limiter, buckets('a@example.com', '1.1.1.1'));
      await enforceRateLimit(limiter, buckets('a@example.com', '2.2.2.2'));

      await expect(
        enforceRateLimit(limiter, buckets('a@example.com', '3.3.3.3'))
      ).rejects.toBeInstanceOf(RateLimitedError);
    });

    it('scopes buckets separately so one identifier does not exhaust another', async () => {
      await enforceRateLimit(limiter, buckets('a@example.com', '1.1.1.1'));
      await enforceRateLimit(limiter, buckets('a@example.com', '1.1.1.1'));

      await expect(
        enforceRateLimit(limiter, buckets('b@example.com', '1.1.1.1'))
      ).resolves.toBeUndefined();
    });

    it('consumes every bucket even when an earlier one already refused', async () => {
      // Otherwise an attacker could keep a coarse IP bucket untouched by
      // deliberately tripping a narrower one first.
      const spy = vi.spyOn(limiter, 'consume');

      await enforceRateLimit(limiter, buckets('a@example.com', '1.1.1.1'));
      await enforceRateLimit(limiter, buckets('a@example.com', '1.1.1.1'));
      spy.mockClear();
      await enforceRateLimit(limiter, buckets('a@example.com', '1.1.1.1')).catch(() => {});

      expect(spy).toHaveBeenCalledTimes(2);
    });
  });

  describe('an unusable identifier', () => {
    it('skips a null id rather than putting everyone in one bucket', async () => {
      // clientIpFrom returns null when no usable header is present. Bucketing
      // all of those together would let one such caller exhaust the budget
      // for every other.
      const spy = vi.spyOn(limiter, 'consume');

      await enforceRateLimit(limiter, [{ scope: 'signIn:ip', id: null, policy: POLICY }]);

      expect(spy).not.toHaveBeenCalled();
    });

    it('still enforces the other buckets when one id is null', async () => {
      const buckets = (email: string) => [
        { scope: 'signIn:email', id: email, policy: POLICY },
        { scope: 'signIn:ip', id: null, policy: POLICY },
      ];
      await enforceRateLimit(limiter, buckets('a@example.com'));
      await enforceRateLimit(limiter, buckets('a@example.com'));

      await expect(enforceRateLimit(limiter, buckets('a@example.com'))).rejects.toBeInstanceOf(
        RateLimitedError
      );
    });
  });

  describe('identifiers are normalised into keys', () => {
    it('treats identifiers differing only in case as one bucket', async () => {
      // Otherwise an attacker rotates A@example.com / a@EXAMPLE.com for a
      // fresh budget against the same account.
      const bucket = (email: string) => [{ scope: 'signIn', id: email, policy: POLICY }];
      await enforceRateLimit(limiter, bucket('a@example.com'));
      await enforceRateLimit(limiter, bucket('A@Example.COM'));

      await expect(enforceRateLimit(limiter, bucket('a@example.com'))).rejects.toBeInstanceOf(
        RateLimitedError
      );
    });

    it('bounds the key length so a long identifier cannot break the store', async () => {
      // Keys go into a varchar(255) column.
      const spy = vi.spyOn(limiter, 'consume');

      await enforceRateLimit(limiter, [
        { scope: 'signIn', id: 'a'.repeat(500), policy: POLICY },
      ]);

      expect(spy.mock.calls[0][0].length).toBeLessThanOrEqual(255);
    });
  });

  describe('mapping onto the action boundary', () => {
    it('surfaces as a RATE_LIMITED AppError through actionResult', async () => {
      const bucket = [{ scope: 'signIn', id: 'a@example.com', policy: POLICY }];

      const call = () =>
        actionResult(async () => {
          await enforceRateLimit(limiter, bucket);
          return ok('done');
        });

      await call();
      await call();
      const result = await call();

      expect(result).toMatchObject({ ok: false, error: { code: 'RATE_LIMITED' } });
    });

    it('does not run the action body once refused', async () => {
      const bucket = [{ scope: 'signIn', id: 'a@example.com', policy: POLICY }];
      const body = vi.fn(async () => ok('done'));

      const call = () =>
        actionResult(async () => {
          await enforceRateLimit(limiter, bucket);
          return body();
        });

      await call();
      await call();
      body.mockClear();
      await call();

      expect(body).not.toHaveBeenCalled();
    });
  });

  describe('configured limits', () => {
    it('limits sign-in more tightly per email than per IP', async () => {
      // A single account under attack must trip before a shared office NAT
      // does, or legitimate colleagues lock each other out.
      expect(RATE_LIMITS.signInPerEmail.limit).toBeLessThan(RATE_LIMITS.signInPerIp.limit);
    });

    it('keeps every configured window short enough to recover from', async () => {
      for (const policy of Object.values(RATE_LIMITS)) {
        expect(policy.windowSeconds).toBeLessThanOrEqual(3600);
        expect(policy.limit).toBeGreaterThan(0);
      }
    });
  });
});
