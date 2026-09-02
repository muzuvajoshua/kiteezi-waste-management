import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { sql } from 'drizzle-orm';
import { createTestDatabase, type TestDatabase } from '@/test-support/pglite-database';
import { RateLimitCounters } from '@/utils/db/schema';
import { DrizzleRateLimiter } from './drizzle-rate-limiter.adapter';

// KWM-063 — first coverage for the limiter that actually runs in production.
//
// The in-memory limiter has had tests since KWM-054, but it is not the one
// deployed: a per-process counter bounds nothing across serverless instances.
// This adapter was the untested one, and it is the one standing between a
// password-guessing attempt and the sign-in path.
//
// The clock is not injected here (unlike the in-memory adapter), so the
// window-expiry case is asserted by writing a counter row in a past window
// rather than by travelling in time.

let database: TestDatabase;
const POLICY = { limit: 3, windowSeconds: 60 };

beforeAll(async () => {
  database = await createTestDatabase();
}, 60_000);

beforeEach(async () => {
  await database.reset();
});

afterAll(async () => {
  await database.close();
});

const limiter = () => new DrizzleRateLimiter(database.db);

describe('DrizzleRateLimiter', () => {
  describe('counting', () => {
    it('allows attempts up to the limit and refuses the next', async () => {
      const rl = limiter();

      expect(await rl.consume('user:1', POLICY)).toMatchObject({ allowed: true, remaining: 2 });
      expect(await rl.consume('user:1', POLICY)).toMatchObject({ allowed: true, remaining: 1 });
      expect(await rl.consume('user:1', POLICY)).toMatchObject({ allowed: true, remaining: 0 });
      expect(await rl.consume('user:1', POLICY)).toMatchObject({ allowed: false, remaining: 0 });
    });

    it('keeps counting past the limit rather than resetting', async () => {
      // Every refused attempt still consumes, so an attacker cannot get a
      // fresh allowance by continuing to hammer the endpoint.
      const rl = limiter();
      for (let i = 0; i < 5; i++) await rl.consume('user:1', POLICY);

      expect(await rl.consume('user:1', POLICY)).toMatchObject({ allowed: false });
      const [row] = await database.db
        .select({ count: RateLimitCounters.count })
        .from(RateLimitCounters);
      expect(row.count).toBe(6);
    });

    it('counts each key separately', async () => {
      // One user exhausting their allowance must not lock out everyone else.
      const rl = limiter();
      for (let i = 0; i < 4; i++) await rl.consume('user:1', POLICY);

      expect(await rl.consume('user:2', POLICY)).toMatchObject({ allowed: true, remaining: 2 });
    });

    it('reports a retryAfter only once refused', async () => {
      const rl = limiter();

      expect(await rl.consume('user:1', POLICY)).toMatchObject({ retryAfterSeconds: 0 });
      await rl.consume('user:1', POLICY);
      await rl.consume('user:1', POLICY);

      const refused = await rl.consume('user:1', POLICY);
      expect(refused.allowed).toBe(false);
      expect(refused.retryAfterSeconds).toBeGreaterThan(0);
      expect(refused.retryAfterSeconds).toBeLessThanOrEqual(POLICY.windowSeconds);
    });
  });

  describe('windows', () => {
    it('writes one row per key and window, not one per attempt', async () => {
      // The composite primary key is what makes the increment a single atomic
      // statement. A row per attempt would mean the count came from a COUNT(*)
      // read-then-write, which is the race the design exists to avoid.
      const rl = limiter();
      await rl.consume('user:1', POLICY);
      await rl.consume('user:1', POLICY);
      await rl.consume('user:1', POLICY);

      const rows = await database.db.select().from(RateLimitCounters);
      expect(rows).toHaveLength(1);
      expect(rows[0].count).toBe(3);
    });

    it('aligns the window to the epoch so concurrent callers agree', async () => {
      await limiter().consume('user:1', POLICY);

      const [row] = await database.db
        .select({ windowStart: RateLimitCounters.windowStart })
        .from(RateLimitCounters);

      expect(row.windowStart.getTime() % (POLICY.windowSeconds * 1000)).toBe(0);
    });

    it('ignores a count from an earlier window', async () => {
      // A stale window must not carry over, or a user refused an hour ago
      // would stay refused forever.
      const staleStart = new Date(Math.floor(Date.now() / 60_000) * 60_000 - 600_000);
      await database.db.insert(RateLimitCounters).values({
        bucketKey: 'user:1',
        windowStart: staleStart,
        count: 99,
        expiresAt: new Date(staleStart.getTime() + 60_000),
      });

      expect(await limiter().consume('user:1', POLICY)).toMatchObject({
        allowed: true,
        remaining: 2,
      });
    });

    it('separates windows of different lengths under the same key', async () => {
      const rl = limiter();
      await rl.consume('user:1', { limit: 3, windowSeconds: 60 });

      // A different window length lands on a different epoch-aligned start,
      // so the two policies do not share a counter.
      const rows = await database.db.select().from(RateLimitCounters);
      await rl.consume('user:1', { limit: 3, windowSeconds: 3600 });

      expect(await database.db.select().from(RateLimitCounters)).not.toHaveLength(rows.length);
    });
  });

  describe('purgeExpired', () => {
    it('deletes windows that have closed', async () => {
      const past = new Date(Date.now() - 120_000);
      await database.db.insert(RateLimitCounters).values({
        bucketKey: 'old',
        windowStart: past,
        count: 1,
        expiresAt: past,
      });

      await limiter().purgeExpired();

      expect(await database.db.select().from(RateLimitCounters)).toHaveLength(0);
    });

    it('keeps a window that is still open', async () => {
      await limiter().consume('user:1', POLICY);

      await limiter().purgeExpired();

      expect(await database.db.select().from(RateLimitCounters)).toHaveLength(1);
    });
  });

  describe('concurrency', () => {
    it('loses no increment when attempts overlap', async () => {
      // The reason this is one INSERT … ON CONFLICT rather than a read then a
      // write. Ten concurrent attempts against a limit of 3 must leave the
      // count at exactly 10 and hand out exactly 3 admissions — a
      // read-then-write would let several callers observe the same
      // under-limit count and all proceed.
      const rl = limiter();

      const decisions = await Promise.all(
        Array.from({ length: 10 }, () => rl.consume('user:1', POLICY))
      );

      const [row] = await database.db
        .select({ count: RateLimitCounters.count })
        .from(RateLimitCounters);
      expect(row.count).toBe(10);
      expect(decisions.filter((d) => d.allowed)).toHaveLength(3);
    });
  });

  it('reads the count back from the statement that wrote it', async () => {
    // Guards the cast on execute()'s result: `Database` is the driver-agnostic
    // PgDatabase, whose result type is an unresolved HKT, so the RETURNING row
    // is not type-checked. If the shape were wrong the count would read as
    // NaN or 0 and every caller would be admitted forever.
    await database.db.execute(sql`
      INSERT INTO rate_limit_counters (bucket_key, window_start, count, expires_at)
      VALUES ('seeded', to_timestamp(0), 2, now() + interval '1 hour')
    `);

    const decision = await limiter().consume('user:1', POLICY);

    expect(decision.remaining).toBe(2);
    expect(Number.isNaN(decision.remaining)).toBe(false);
  });
});
