export interface RateLimitPolicy {
  /** Maximum permitted attempts within the window. */
  readonly limit: number;
  /** Window length in seconds. */
  readonly windowSeconds: number;
}

export interface RateLimitDecision {
  readonly allowed: boolean;
  /** Attempts still permitted in the current window; 0 once exhausted. */
  readonly remaining: number;
  /** Seconds until the window resets. 0 when the attempt was allowed. */
  readonly retryAfterSeconds: number;
}

// Port: counts attempts against a key and says whether one more is permitted.
//
// `consume` both counts and decides, in one call, because splitting them into
// "check" then "record" makes the pair racy — two concurrent requests would
// both read an under-limit count before either wrote. Implementations must
// increment and decide atomically.
export interface RateLimiter {
  consume(key: string, policy: RateLimitPolicy): Promise<RateLimitDecision>;
}
