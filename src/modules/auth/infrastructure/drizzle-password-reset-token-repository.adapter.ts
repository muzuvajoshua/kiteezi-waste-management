import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/utils/db/dbConfig';
import { PasswordResetTokens } from '@/utils/db/schema';
import type {
  PasswordResetTokenRepository,
  PasswordResetTokenRecord,
  CreatePasswordResetTokenInput,
} from '../application/ports/password-reset-token-repository.port';

const RECORD_COLUMNS = {
  id: PasswordResetTokens.id,
  userId: PasswordResetTokens.userId,
  expiresAt: PasswordResetTokens.expiresAt,
  usedAt: PasswordResetTokens.usedAt,
};

// The raw token is never selected — it is not stored. Lookups are by hash,
// which the unique index makes a single-row fetch.
export class DrizzlePasswordResetTokenRepository implements PasswordResetTokenRepository {
  async create(input: CreatePasswordResetTokenInput): Promise<PasswordResetTokenRecord> {
    const [row] = await db
      .insert(PasswordResetTokens)
      .values({
        userId: input.userId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
      })
      .returning(RECORD_COLUMNS)
      .execute();

    return row;
  }

  async findByTokenHash(tokenHash: string): Promise<PasswordResetTokenRecord | null> {
    const [row] = await db
      .select(RECORD_COLUMNS)
      .from(PasswordResetTokens)
      .where(eq(PasswordResetTokens.tokenHash, tokenHash))
      .execute();

    return row ?? null;
  }

  async markUsed(id: number): Promise<void> {
    await db
      .update(PasswordResetTokens)
      .set({ usedAt: new Date() })
      .where(eq(PasswordResetTokens.id, id))
      .execute();
  }

  async invalidateAllForUser(userId: number): Promise<void> {
    // Only unused rows, so an already-consumed token keeps its original
    // usedAt timestamp rather than being rewritten on every later reset.
    await db
      .update(PasswordResetTokens)
      .set({ usedAt: new Date() })
      .where(and(eq(PasswordResetTokens.userId, userId), isNull(PasswordResetTokens.usedAt)))
      .execute();
  }
}
