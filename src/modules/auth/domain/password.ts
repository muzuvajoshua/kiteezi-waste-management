import { DomainError } from '@/shared/domain/domain-error';

// Password policy, shaped by NIST SP 800-63B: length is the control that
// matters. Composition rules ("must contain a symbol") are deliberately
// absent — they push people toward "Password1!" and measurably reduce entropy
// while feeling stricter.
export const MIN_PASSWORD_LENGTH = 8;

// Not a strength rule. scrypt's cost scales with input length, so an
// unbounded password is a cheap way to make the server do expensive work —
// this is the DoS bound, which is why it is generous rather than tight.
export const MAX_PASSWORD_LENGTH = 1024;

export class WeakPasswordError extends DomainError {
  readonly code = 'WEAK_PASSWORD' as const;
  constructor(message: string) {
    super(message);
  }
}

/** Throws WeakPasswordError unless the password satisfies the policy. */
export function assertPasswordAcceptable(password: string): void {
  // Counts characters, not UTF-16 units: '🔑🔑🔑🔑' is 8 units but 4
  // characters, and treating it as 8 would let a 4-character password pass.
  const length = [...password].length;

  if (length < MIN_PASSWORD_LENGTH) {
    throw new WeakPasswordError(
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
    );
  }
  if (length > MAX_PASSWORD_LENGTH) {
    throw new WeakPasswordError(
      `Password must be at most ${MAX_PASSWORD_LENGTH} characters.`
    );
  }
}

/**
 * The canonical form of an email address for identity purposes.
 *
 * Lowercased so 'Citizen@example.com' and 'citizen@example.com' cannot become
 * two accounts — the unique constraint on (provider, provider_subject) is
 * byte-exact, so normalisation has to happen before it is consulted.
 *
 * Deliberately does NOT strip dots or +tags: those are provider-specific
 * conventions (Gmail's, mostly), and applying them universally would merge
 * addresses that other providers treat as distinct people.
 */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}
