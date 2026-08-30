import type {
  SessionRepository,
  SessionRecord,
  CreateSessionInput,
} from '../application/ports/session-repository.port';

interface Row {
  sessionId: string;
  userId: number;
  expiresAt: Date;
  revokedAt: Date | null;
}

export class InMemorySessionRepository implements SessionRepository {
  private readonly rows = new Map<string, Row>();

  async create(input: CreateSessionInput): Promise<void> {
    this.rows.set(input.sessionId, { ...input, revokedAt: null });
  }

  async findById(sessionId: string): Promise<SessionRecord | null> {
    return this.rows.get(sessionId) ?? null;
  }

  async revoke(sessionId: string): Promise<void> {
    const row = this.rows.get(sessionId);
    if (row && row.revokedAt === null) row.revokedAt = new Date();
  }

  async revokeAllForUser(userId: number): Promise<number> {
    let ended = 0;
    for (const row of this.rows.values()) {
      if (row.userId === userId && row.revokedAt === null) {
        row.revokedAt = new Date();
        ended += 1;
      }
    }
    return ended;
  }

  /** Test helper. */
  clear(): void {
    this.rows.clear();
  }
}
