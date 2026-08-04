import { eq } from 'drizzle-orm';
import { db } from '@/utils/db/dbConfig';
import { Users } from '@/utils/db/schema';
import type { UserRepository, UserRecord } from '../application/ports/user-repository.port';

// Relocated from utils/db/internal.ts, with the try/catch-return-null
// wrapping dropped: a genuine DB failure now propagates rather than being
// silently reinterpreted as "user not found" (see get-current-user.usecase.ts's
// docstring for why this matters — the old swallow was a latent bug where a
// DB outage got misreported as "not logged in").
export class DrizzleUserRepository implements UserRepository {
  async getUserById(id: number): Promise<UserRecord | null> {
    const [user] = await db.select().from(Users).where(eq(Users.id, id)).execute();
    return user ?? null;
  }

  async getUserByEmail(email: string): Promise<UserRecord | null> {
    const [user] = await db.select().from(Users).where(eq(Users.email, email)).execute();
    return user ?? null;
  }

  async createUser(email: string, name: string): Promise<UserRecord | null> {
    const [user] = await db.insert(Users).values({ email, name }).returning().execute();
    return user ?? null;
  }
}
