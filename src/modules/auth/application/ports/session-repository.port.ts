export interface SessionRecord {
  readonly sessionId: string;
  readonly userId: number;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
}

export interface CreateSessionInput {
  readonly sessionId: string;
  readonly userId: number;
  readonly expiresAt: Date;
}

// Port: the server's record of which sessions exist and which are still good.
//
// This is what makes a session revocable. Without it the token is the only
// authority, and a stateless JWT cannot be withdrawn before it expires — so
// "log out" protects nobody who has already had their cookie copied.
//
// The cost is one read per authenticated request. That is the price of
// revocation, and it is paid deliberately: the alternative is a seven-day
// window in which a leaked cookie cannot be stopped.
export interface SessionRepository {
  create(input: CreateSessionInput): Promise<void>;

  findById(sessionId: string): Promise<SessionRecord | null>;

  /** Revokes one session — logout. Unknown ids are a no-op. */
  revoke(sessionId: string): Promise<void>;

  /**
   * Revokes every live session for a user, returning how many were ended.
   *
   * Used after a password reset and by an administrator terminating an
   * account. The count is returned so the caller can tell the user how many
   * devices were signed out, which is how someone notices an unfamiliar one.
   */
  revokeAllForUser(userId: number): Promise<number>;
}
