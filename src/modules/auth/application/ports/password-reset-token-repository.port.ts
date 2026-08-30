export interface PasswordResetTokenRecord {
  readonly id: number;
  readonly userId: number;
  readonly expiresAt: Date;
  readonly usedAt: Date | null;
}

export interface CreatePasswordResetTokenInput {
  readonly userId: number;
  readonly tokenHash: string;
  readonly expiresAt: Date;
}

export interface PasswordResetTokenRepository {
  create(input: CreatePasswordResetTokenInput): Promise<PasswordResetTokenRecord>;
  findByTokenHash(tokenHash: string): Promise<PasswordResetTokenRecord | null>;
  markUsed(id: number): Promise<void>;
  /**
   * Invalidates every outstanding token for a user.
   *
   * Called after a successful reset: any other pending link — including one an
   * attacker requested — must stop working the moment the real owner changes
   * the password.
   */
  invalidateAllForUser(userId: number): Promise<void>;
}
