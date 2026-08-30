import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/utils/db/dbConfig';
import { Sessions } from '@/utils/db/schema';
import type {
  SessionRepository,
  SessionRecord,
  CreateSessionInput,
} from '../application/ports/session-repository.port';

export class DrizzleSessionRepository implements SessionRepository {
  async create(input: CreateSessionInput): Promise<void> {
    await db
      .insert(Sessions)
      .values({
        sessionId: input.sessionId,
        userId: input.userId,
        expiresAt: input.expiresAt,
      })
      .execute();
  }

  async findById(sessionId: string): Promise<SessionRecord | null> {
    const [row] = await db
      .select({
        sessionId: Sessions.sessionId,
        userId: Sessions.userId,
        expiresAt: Sessions.expiresAt,
        revokedAt: Sessions.revokedAt,
      })
      .from(Sessions)
      .where(eq(Sessions.sessionId, sessionId))
      .execute();

    return row ?? null;
  }

  async revoke(sessionId: string): Promise<void> {
    // Only unrevoked rows, so a repeated logout does not rewrite the original
    // revocation time and lose when the session actually ended.
    await db
      .update(Sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(Sessions.sessionId, sessionId), isNull(Sessions.revokedAt)))
      .execute();
  }

  async revokeAllForUser(userId: number): Promise<number> {
    const ended = await db
      .update(Sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(Sessions.userId, userId), isNull(Sessions.revokedAt)))
      .returning({ sessionId: Sessions.sessionId })
      .execute();

    return ended.length;
  }
}
