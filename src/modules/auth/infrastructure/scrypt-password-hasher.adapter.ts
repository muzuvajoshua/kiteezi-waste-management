import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { PasswordHasher } from '../application/ports/password-hasher.port';

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number }
) => Promise<Buffer>;

export interface ScryptParams {
  readonly N: number;
  readonly r: number;
  readonly p: number;
}

// Node's built-in scrypt — no dependency, and no native build to fail on
// Vercel, which is why this rather than argon2 or bcrypt.
//
// N = 2^16 (64 MiB, ~240ms on the development machine). OWASP's headline
// minimum is 2^17, but that is 128 MiB *per concurrent hash*: on a 1 GB
// serverless function roughly eight simultaneous sign-ins would exhaust
// memory, and an attacker could trigger that deliberately. 2^16 keeps ~16
// concurrent sign-ins inside the same budget while staying in OWASP's
// accepted range. Raise it when the deployment has memory to spare — the
// encoding below is designed to make that safe.
const DEFAULT_PARAMS: ScryptParams = { N: 65536, r: 8, p: 1 };

const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const SCHEME = 'scrypt';

// Ceiling on what a *stored* hash may ask us to allocate. A corrupted or
// hostile row could otherwise name N = 2^30 and have the server try to
// allocate a terabyte while verifying it.
const MAX_ALLOWED_MEMORY = 256 * 1024 * 1024;

function memoryFor({ N, r }: { N: number; r: number }): number {
  return 128 * N * r;
}

/**
 * Encoded as `scrypt$N$r$p$salt$hash`, both binary fields base64url.
 *
 * Self-describing on purpose: the cost parameters travel with each hash, so
 * raising the default does not invalidate existing passwords — old rows keep
 * verifying at the cost they were written with, and can be re-hashed on next
 * successful sign-in. A bare digest would make any parameter change a
 * mass lockout.
 */
export class ScryptPasswordHasher implements PasswordHasher {
  constructor(private readonly params: ScryptParams = DEFAULT_PARAMS) {}

  async hash(password: string): Promise<string> {
    const { N, r, p } = this.params;
    const salt = randomBytes(SALT_LENGTH);
    const derived = await scryptAsync(password, salt, KEY_LENGTH, {
      N,
      r,
      p,
      maxmem: memoryFor({ N, r }) * 2,
    });

    return [
      SCHEME,
      N,
      r,
      p,
      salt.toString('base64url'),
      derived.toString('base64url'),
    ].join('$');
  }

  async verify(password: string, encodedHash: string): Promise<boolean> {
    // Every failure path returns false rather than throwing: a malformed row
    // is a failed sign-in, not a 500. Throwing would also hand an attacker a
    // way to distinguish "corrupt record" from "wrong password".
    const parts = encodedHash.split('$');
    if (parts.length !== 6) return false;

    const [scheme, rawN, rawR, rawP, rawSalt, rawDigest] = parts;
    if (scheme !== SCHEME) return false;

    const N = Number(rawN);
    const r = Number(rawR);
    const p = Number(rawP);
    if (![N, r, p].every((value) => Number.isInteger(value) && value > 0)) return false;
    if (memoryFor({ N, r }) > MAX_ALLOWED_MEMORY) return false;

    const salt = Buffer.from(rawSalt, 'base64url');
    const expected = Buffer.from(rawDigest, 'base64url');
    if (salt.length === 0 || expected.length === 0) return false;

    try {
      const actual = await scryptAsync(password, salt, expected.length, {
        N,
        r,
        p,
        maxmem: memoryFor({ N, r }) * 2,
      });
      // timingSafeEqual, not ===: a byte-by-byte comparison that short-circuits
      // leaks how much of the digest matched.
      return actual.length === expected.length && timingSafeEqual(actual, expected);
    } catch {
      return false;
    }
  }
}
