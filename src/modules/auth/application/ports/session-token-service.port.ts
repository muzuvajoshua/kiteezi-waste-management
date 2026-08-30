export interface SignedSession {
  readonly token: string;
  /**
   * The session's id, also embedded in the token as its `jti`.
   *
   * Returned to the caller so the session can be recorded server-side. A
   * token with no server-side record cannot be revoked, which is what
   * KWM-079 exists to fix — so signing and recording are two halves of one
   * operation, and the id is what joins them.
   */
  readonly sessionId: string;
}

export interface SessionClaims {
  readonly userId: number;
  readonly sessionId: string;
}

// Port: sign/verify the session token. `verify` never throws — an
// invalid/expired/tampered token is an expected outcome, resolved to `null`
// rather than propagated as a fault (see the jose adapter's docstring for
// why this specific contract matters).
export interface SessionTokenService {
  sign(payload: { userId: number }): Promise<SignedSession>;
  verify(token: string): Promise<SessionClaims | null>;
}
