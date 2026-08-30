import type {
  RateLimiter,
  RateLimitPolicy,
  RateLimitDecision,
} from '@/shared/application/ports/rate-limiter.port';

interface Counter {
  count: number;
  /** Epoch milliseconds at which this window closes. */
  expiresAt: number;
}

// Process-local fixed-window limiter.
//
// This is the development implementation, not merely a test fake: `next dev`
// serves every request from one process, so a per-process counter is accurate
// there. It is NOT the production implementation — see
// drizzle-rate-limiter.adapter.ts for why a serverless deployment needs
// shared state.
//
// Expired entries are swept opportunistically on write rather than by a
// timer: a timer would keep a serverless instance alive, and in a long-lived
// dev process the sweep is what stops one counter accumulating per distinct
// key seen (every attacker IP, forever).
export class InMemoryRateLimiter implements RateLimiter {
  private readonly counters = new Map<string, Counter>();
  private lastSweep = 0;

  constructor(private readonly now: () => number = () => Date.now()) {}

  async consume(key: string, policy: RateLimitPolicy): Promise<RateLimitDecision> {
    const at = this.now();
    this.sweep(at);

    const windowMs = policy.windowSeconds * 1000;
    const existing = this.counters.get(key);

    // A missing OR expired counter starts a fresh window. Treating expiry as
    // "absent" is what makes the window fixed rather than sliding.
    const counter =
      existing && existing.expiresAt > at ? existing : { count: 0, expiresAt: at + windowMs };

    counter.count += 1;
    this.counters.set(key, counter);

    const allowed = counter.count <= policy.limit;

    return {
      allowed,
      remaining: Math.max(0, policy.limit - counter.count),
      // Rounded up so a caller told to wait N seconds is never told to retry
      // while the window is still open.
      retryAfterSeconds: allowed ? 0 : Math.max(0, Math.ceil((counter.expiresAt - at) / 1000)),
    };
  }

  /** Test helper: how many counters are currently held. */
  size(): number {
    return this.counters.size;
  }

  /**
   * Drops every counter.
   *
   * For tests that share one limiter across many cases: without it, a suite
   * whose cases all act as the same user would exhaust a real budget partway
   * through and start failing for rate-limit reasons rather than the reason
   * under test.
   */
  clear(): void {
    this.counters.clear();
    this.lastSweep = 0;
  }

  private sweep(at: number): void {
    // At most once a second — sweeping on every call would make each request
    // O(keys).
    if (at - this.lastSweep < 1000) return;
    this.lastSweep = at;

    for (const [key, counter] of this.counters) {
      if (counter.expiresAt <= at) this.counters.delete(key);
    }
  }
}
