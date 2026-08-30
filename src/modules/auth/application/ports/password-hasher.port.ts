// Port: turns a password into something safe to store, and checks one against
// a stored value.
//
// Separate from IdentityProvider by design (interface segregation): verifying
// an OIDC token and checking a secret are different operations with different
// shapes, and a Google adapter has no business implementing either half of
// this.
export interface PasswordHasher {
  /** Returns a self-describing encoded hash — algorithm, parameters and salt included. */
  hash(password: string): Promise<string>;

  /**
   * Constant-time comparison against an encoded hash. Returns false rather
   * than throwing for a malformed or unrecognised stored value: a corrupt row
   * is a failed sign-in, not a server error to surface to the caller.
   */
  verify(password: string, encodedHash: string): Promise<boolean>;
}
