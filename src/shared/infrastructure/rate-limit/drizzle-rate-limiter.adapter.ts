import { sql } from 'drizzle-orm';
import { db } from '@/utils/db/dbConfig';
import type {
  RateLimiter,
  RateLimitPolicy,
  RateLimitDecision,
} from '@/shared/application/ports/rate-limiter.port';

// Fixed-window rate limiter backed by Postgres.
//
// Why the database and not process memory: a serverless deployment runs many
// instances, and requests are spread across them. A per-process counter would
// let an attacker get `limit` attempts per instance, and simply making more
// concurrent requests spawns more instances — so the bound rises with the
// attack. Shared state is the whole point.
//
// Why Postgres and not Redis: Neon is already provisioned, so this adds no
// vendor, no credential and no free-tier clock. Behind the RateLimiter port,
// moving to Upstash later (as KWM-054 originally proposed) is one adapter and
// no change above infrastructure. The cost is one round trip per limited
// call, which at this application's scale is not the constraint.
//
// KNOWN PROPERTY — fixed window, not sliding: an attacker who times requests
// around a window boundary can land up to 2x `limit` in quick succession
// (the tail of one window plus the head of the next). Accepted deliberately.
// A sliding-window implementation needs either a sorted set of timestamps per
// key or two counters read together, and neither is worth the complexity for
// what is a brute-force *slowdown*, not a hard admission gate. The limits
// chosen in presentation/rate-limit.ts assume this and are set low enough
// that twice them is still safe.
export class DrizzleRateLimiter implements RateLimiter {
  async consume(key: string, policy: RateLimitPolicy): Promise<RateLimitDecision> {
    const windowMs = policy.windowSeconds * 1000;
    const nowMs = Date.now();
    // Epoch-aligned bucket, so concurrent requests agree which window they
    // are in without coordinating.
    const windowStartMs = Math.floor(nowMs / windowMs) * windowMs;
    const windowStart = new Date(windowStartMs);
    const expiresAt = new Date(windowStartMs + windowMs);

    // One statement: increment and read back atomically. A read-then-write
    // pair would let two concurrent requests both observe an under-limit
    // count and both proceed — which is exactly the burst a limiter exists to
    // stop.
    const rows = await db.execute<{ count: number }>(sql`
      INSERT INTO rate_limit_counters (bucket_key, window_start, count, expires_at)
      VALUES (${key}, ${windowStart}, 1, ${expiresAt})
      ON CONFLICT (bucket_key, window_start)
      DO UPDATE SET count = rate_limit_counters.count + 1
      RETURNING count
    `);

    const count = Number(rows.rows[0]?.count ?? 0);
    const allowed = count <= policy.limit;

    return {
      allowed,
      remaining: Math.max(0, policy.limit - count),
      retryAfterSeconds: allowed
        ? 0
        : Math.max(0, Math.ceil((expiresAt.getTime() - nowMs) / 1000)),
    };
  }

  /**
   * Deletes windows that have closed.
   *
   * Nothing calls this yet. Rows are small and bounded by (distinct keys x
   * windows), so they accumulate slowly, but they do accumulate — this needs
   * a scheduled job (KWM-058, background jobs) or a periodic sweep before the
   * table is left to run unattended for long. Written now so the cleanup path
   * exists and is named, rather than discovered later as unbounded growth.
   */
  async purgeExpired(): Promise<void> {
    await db.execute(sql`DELETE FROM rate_limit_counters WHERE expires_at <= now()`);
  }
}
