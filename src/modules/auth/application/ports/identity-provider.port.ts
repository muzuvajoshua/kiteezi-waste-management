// Port: verifies an external identity token (Google OIDC today) and returns
// the identity it asserts. Throws on an invalid token — unlike
// SessionTokenService.verify, an unverifiable *external* credential during
// sign-in is a genuine failure to report, not a routine "no session" outcome.
//
// Scoped to OIDC token verification only. Email/password sign-in is a
// different mechanism with a different shape (a secret to compare, not a
// token to verify), so it gets its own port rather than widening this one —
// a Google adapter has no business implementing password checking.
export interface IdentityProvider {
  verifyToken(idToken: string): Promise<ExternalIdentity>;
}

export interface ExternalIdentity {
  /**
   * The provider's stable, immutable identifier for this person — Google's
   * `sub`. This, not the email, is what an account is keyed on.
   *
   * Email is a poor identity key: addresses get reassigned, and keying on one
   * means anyone who can obtain a token bearing that address becomes that
   * user. `sub` never changes for a given Google account and is never reused.
   */
  readonly subject: string;

  readonly email?: string;

  /**
   * Whether the provider vouches for the address. An unverified email must
   * not be trusted for account linking — otherwise someone could register an
   * unverified address matching an existing account and inherit it.
   */
  readonly emailVerified?: boolean;

  readonly name?: string;
}
