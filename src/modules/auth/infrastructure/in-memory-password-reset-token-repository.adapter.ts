import type {
  PasswordResetTokenRepository,
  PasswordResetTokenRecord,
  CreatePasswordResetTokenInput,
} from '../application/ports/password-reset-token-repository.port';

// The port's record is readonly for callers; the fake owns its own mutable
// rows so markUsed/invalidateAll can behave like an UPDATE.
interface Row {
  id: number;
  userId: number;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
}

export class InMemoryPasswordResetTokenRepository implements PasswordResetTokenRepository {
  private readonly rows: Row[] = [];
  private nextId = 1;

  async create(input: CreatePasswordResetTokenInput): Promise<PasswordResetTokenRecord> {
    const row: Row = {
      id: this.nextId++,
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      usedAt: null,
    };
    this.rows.push(row);
    return row;
  }

  async findByTokenHash(tokenHash: string): Promise<PasswordResetTokenRecord | null> {
    return this.rows.find((row) => row.tokenHash === tokenHash) ?? null;
  }

  async markUsed(id: number): Promise<void> {
    const row = this.rows.find((r) => r.id === id);
    if (row) row.usedAt = new Date();
  }

  async invalidateAllForUser(userId: number): Promise<void> {
    const now = new Date();
    for (const row of this.rows) {
      if (row.userId === userId && row.usedAt === null) row.usedAt = now;
    }
  }
}
