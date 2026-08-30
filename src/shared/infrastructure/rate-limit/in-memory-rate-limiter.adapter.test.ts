import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryRateLimiter } from './in-memory-rate-limiter.adapter';

// The in-memory limiter is a real implementation, not only a test fake: it is
// what runs in development, where a single process serves every request. In
// production it is replaced by the Drizzle adapter (see that file for why a
// per-instance counter cannot bound a serverless deployment).
//
// The clock is injected so window expiry is asserted deterministically rather
// than by sleeping.

const POLICY = { limit: 3, windowSeconds: 60 };

let now: number;
let limiter: InMemoryRateLimiter;

beforeEach(() => {
  now = 1_000_000;
  limiter = new InMemoryRateLimiter(() => now);
});

describe('InMemoryRateLimiter', () => {
  describe('within the limit', () => {
    it('allows the first attempt', async () => {
      expect(await limiter.consume('user:1', POLICY)).toMatchObject({ allowed: true });
    });

    it('allows attempts up to the limit', async () => {
      await limiter.consume('user:1', POLICY);
      await limiter.consume('user:1', POLICY);

      expect(await limiter.consume('user:1', POLICY)).toMatchObject({ allowed: true });
    });

    it('counts down the remaining allowance', async () => {
      expect((await limiter.consume('user:1', POLICY)).remaining).toBe(2);
      expect((await limiter.consume('user:1', POLICY)).remaining).toBe(1);
      expect((await limiter.consume('user:1', POLICY)).remaining).toBe(0);
    });

    it('reports no wait while attempts remain', async () => {
      expect((await limiter.consume('user:1', POLICY)).retryAfterSeconds).toBe(0);
    });
  });

  describe('beyond the limit', () => {
    async function exhaust(key = 'user:1') {
      for (let i = 0; i < POLICY.limit; i += 1) await limiter.consume(key, POLICY);
    }

    it('refuses the attempt after the limit', async () => {
      await exhaust();

      expect(await limiter.consume('user:1', POLICY)).toMatchObject({
        allowed: false,
        remaining: 0,
      });
    });

    it('says how long to wait', async () => {
      await exhaust();
      now += 10_000; // 10s into the window

      expect((await limiter.consume('user:1', POLICY)).retryAfterSeconds).toBe(50);
    });

    it('never reports a negative wait', async () => {
      await exhaust();
      now += 59_999;

      expect((await limiter.consume('user:1', POLICY)).retryAfterSeconds).toBeGreaterThanOrEqual(0);
    });

    it('keeps refusing while the window is open', async () => {
      await exhaust();
      now += 30_000;

      expect(await limiter.consume('user:1', POLICY)).toMatchObject({ allowed: false });
    });
  });

  describe('window expiry', () => {
    it('allows again once the window has passed', async () => {
      for (let i = 0; i < POLICY.limit; i += 1) await limiter.consume('user:1', POLICY);
      now += 60_000;

      expect(await limiter.consume('user:1', POLICY)).toMatchObject({
        allowed: true,
        remaining: 2,
      });
    });

    it('does not reset early', async () => {
      for (let i = 0; i < POLICY.limit; i += 1) await limiter.consume('user:1', POLICY);
      now += 59_000;

      expect(await limiter.consume('user:1', POLICY)).toMatchObject({ allowed: false });
    });
  });

  describe('keys are independent', () => {
    it('does not let one key exhaust another', async () => {
      for (let i = 0; i < POLICY.limit; i += 1) await limiter.consume('user:1', POLICY);

      expect(await limiter.consume('user:2', POLICY)).toMatchObject({ allowed: true });
    });

    it('separates identical identifiers under different scopes', async () => {
      // 'signIn:alice' and 'register:alice' must not share a budget, or
      // failing to sign in would block registering.
      for (let i = 0; i < POLICY.limit; i += 1) await limiter.consume('signIn:alice', POLICY);

      expect(await limiter.consume('register:alice', POLICY)).toMatchObject({ allowed: true });
    });
  });

  describe('housekeeping', () => {
    it('does not grow without bound as keys expire', async () => {
      // A long-lived process seeing many distinct keys (every attacker IP)
      // must not accumulate a counter per key forever.
      for (let i = 0; i < 500; i += 1) await limiter.consume(`ip:${i}`, POLICY);
      now += 120_000;
      await limiter.consume('ip:fresh', POLICY);

      expect(limiter.size()).toBeLessThan(500);
    });
  });
});
