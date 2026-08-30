// Maximum length of a value accepted as an IP. Rate-limit keys are stored in
// a varchar(255) column, and an attacker who controls the key could otherwise
// both break the insert and mint unlimited distinct buckets to escape their
// own limit.
const MAX_IP_LENGTH = 45; // longest possible IPv6 with an embedded IPv4

// Only characters that appear in IPv4 or IPv6 literals. Deliberately not a
// full IP parser: the goal is to reject anything that could be used as a
// hostile key, not to validate addressing.
const IP_SHAPE = /^[0-9a-fA-F:.]+$/;

/**
 * The caller's IP address, from the proxy headers, or null when none is
 * usable.
 *
 * ⚠️ TRUST ASSUMPTION. These headers are only meaningful because the
 * application sits behind a proxy (Vercel) that sets them. Anything a client
 * sends directly is attacker-controlled, so this is only sound while the
 * deployment is actually behind that proxy — running the app on a directly
 * reachable port would make every IP-keyed limit trivially bypassable by
 * sending your own `x-forwarded-for`.
 *
 * `x-real-ip` is preferred because it holds a single value the platform sets,
 * with no chain to interpret. `x-forwarded-for` is the fallback and its first
 * entry is taken, which is the convention for this platform.
 *
 * Because IP keys can be rotated by an attacker with many addresses, they are
 * never the only defence: the sign-in limits in rate-limit.ts also key on the
 * email being targeted, which an attacker cannot rotate while still attacking
 * one account.
 *
 * Returns null rather than a placeholder on purpose. A shared 'unknown'
 * bucket would let one header-less caller exhaust the budget for every other.
 */
export function clientIpFrom(headers: Headers): string | null {
  const candidate =
    headers.get('x-real-ip')?.trim() ||
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    '';

  if (!candidate || candidate.length > MAX_IP_LENGTH) return null;
  if (!IP_SHAPE.test(candidate)) return null;

  return candidate;
}
