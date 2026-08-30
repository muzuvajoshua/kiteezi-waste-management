import { DomainError } from '@/shared/domain/domain-error';
import type { RateLimiter, RateLimitPolicy } from '@/shared/application/ports/rate-limiter.port';

// KWM-054 — the rate-limit guard actions call.
//
// Throws rather than returning a Result, so it composes with the existing
// action shape: actionResult already maps a DomainError whose `code` is an
// AppErrorCode onto that code, so RateLimitedError becomes a RATE_LIMITED
// AppError with no change to the boundary.

export class RateLimitedError extends DomainError {
  readonly code = 'RATE_LIMITED' as const;

  constructor(readonly retryAfterSeconds: number) {
    super(
      `Too many attempts. Please try again in ${Math.max(1, retryAfterSeconds)} second${
        retryAfterSeconds === 1 ? '' : 's'
      }.`
    );
  }
}

export interface RateLimitBucket {
  /** Namespace for the counter, e.g. 'signIn:email'. */
  readonly scope: string;
  /**
   * What is being limited — an email, an IP, a user id. `null` means the
   * identifier could not be determined, and the bucket is skipped rather than
   * collapsed into a shared one.
   */
  readonly id: string | number | null;
  readonly policy: RateLimitPolicy;
}

// Postgres stores keys in varchar(255).
const MAX_KEY_LENGTH = 255;

/**
 * Limits in force. Deliberately conservative — this application has no real
 * traffic yet, and a limit that is too tight shows up immediately as a
 * complaint, while one that is too loose shows up as a breach nobody notices.
 *
 * Sign-in is limited per EMAIL more tightly than per IP, because the email is
 * the thing an attacker cannot rotate while still attacking one account,
 * whereas addresses are cheap. The per-IP limit is the looser backstop, and
 * is deliberately not tight enough to lock out a shared office NAT.
 */
export const RATE_LIMITS = {
  /** Brute-forcing one account. */
  signInPerEmail: { limit: 5, windowSeconds: 300 },
  /** Credential stuffing many accounts from one source. */
  signInPerIp: { limit: 20, windowSeconds: 300 },
  /** Automated account creation. */
  registerPerIp: { limit: 5, windowSeconds: 3600 },
  /** Reset-link spam aimed at one person's inbox. */
  passwordResetPerEmail: { limit: 3, windowSeconds: 3600 },
  /** Reset requests, and guesses at a reset token, from one source. */
  passwordResetPerIp: { limit: 10, windowSeconds: 3600 },
  /** Ordinary authenticated writes — high enough to never bother a real user. */
  mutationPerUser: { limit: 30, windowSeconds: 60 },
} as const satisfies Record<string, RateLimitPolicy>;

function keyFor(bucket: RateLimitBucket, id: string | number): string {
  // Lowercased so an identifier differing only in case cannot buy a fresh
  // budget against the same target.
  const normalised = String(id).trim().toLowerCase();
  return `${bucket.scope}:${normalised}`.slice(0, MAX_KEY_LENGTH);
}

/**
 * Consumes one attempt from every bucket, and throws RateLimitedError if any
 * of them is exhausted.
 *
 * EVERY bucket is consumed even after one has already refused. Short-circuiting
 * would let an attacker keep a coarse bucket (per-IP) untouched by
 * deliberately tripping a narrower one (per-email) first, so the coarse limit
 * would never accumulate.
 *
 * The longest wait across the exhausted buckets is reported, so a caller told
 * to wait N seconds is not refused again immediately afterwards.
 */
export async function enforceRateLimit(
  rateLimiter: RateLimiter,
  buckets: readonly RateLimitBucket[]
): Promise<void> {
  let longestWait = 0;

  for (const bucket of buckets) {
    // A null identifier means "unknown", not "everyone" — see
    // client-identity.ts for why a shared bucket would be worse than none.
    if (bucket.id === null) continue;

    const decision = await rateLimiter.consume(keyFor(bucket, bucket.id), bucket.policy);
    if (!decision.allowed) {
      longestWait = Math.max(longestWait, decision.retryAfterSeconds);
    }
  }

  if (longestWait > 0) throw new RateLimitedError(longestWait);
}
