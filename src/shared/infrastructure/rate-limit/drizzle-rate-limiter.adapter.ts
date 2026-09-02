import { sql } from 'drizzle-orm';
import type { Database } from '@/shared/infrastructure/persistence/database';
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
  constructor(private readonly db: Database) {}

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
    //
    // The result is cast rather than typed through `execute<T>`: `Database` is
    // the driver-agnostic `PgDatabase`, whose result type is an unresolved
    // HKT, so the generic resolves to `unknown`. The statement's RETURNING
    // clause is right here and names one column, and the contract test
    // asserts the counting behaviour against a real Postgres, so the cast is
    // checked by a test rather than only by inspection.
    const result = (await this.db.execute(sql`
      INSERT INTO rate_limit_counters (bucket_key, window_start, count, expires_at)
      VALUES (${key}, ${windowStart}, 1, ${expiresAt})
      ON CONFLICT (bucket_key, window_start)
      DO UPDATE SET count = rate_limit_counters.count + 1
      RETURNING count
    `)) as unknown as { rows: readonly { count: number }[] };

    const count = Number(result.rows[0]?.count ?? 0);
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
    // `now() AT TIME ZONE 'utc'`, not `now()`.
    //
    // window_start and expires_at are `timestamp without time zone`, and the
    // driver writes UTC wall time into them. `now()` is a timestamptz, so
    // comparing it against one of those columns silently converts it to the
    // SESSION's timezone. On any connection whose TimeZone is not UTC the
    // comparison is skewed by the offset — at UTC+9 every counter looks
    // expired the moment it is written, so this statement deletes live
    // windows and rate limiting stops bounding anything.
    //
    // Neon's sessions default to UTC, which is why this never showed in
    // production. It surfaced the first time the adapter ran against a
    // database inheriting the machine's timezone (KWM-063). Making the
    // comparison explicit removes the dependency on session configuration
    // rather than relying on the default holding — which matters more once
    // KWM-058 actually schedules this.
    await this.db.execute(
      sql`DELETE FROM rate_limit_counters WHERE expires_at <= (now() AT TIME ZONE 'utc')`
    );
  }
}
