export interface GeneratedResetToken {
  /** The secret that goes in the email link. Never stored. */
  readonly token: string;
  /** What is stored, so a database leak yields no usable link. */
  readonly tokenHash: string;
}

// Port: mints reset tokens and derives the stored hash from one.
//
// `hash` is separate so verification can hash an incoming token and look it
// up by that, rather than reading candidate rows and comparing — the lookup
// stays a single indexed query and no raw token is ever compared.
export interface ResetTokenService {
  generate(): GeneratedResetToken;
  hash(token: string): string;
}
