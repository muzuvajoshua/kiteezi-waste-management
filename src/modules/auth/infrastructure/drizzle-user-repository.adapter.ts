import { eq } from 'drizzle-orm';
import type { Database } from '@/shared/infrastructure/persistence/database';
import { Users } from '@/utils/db/schema';
import type { UserRepository, UserRecord } from '../application/ports/user-repository.port';

// Relocated from utils/db/internal.ts, with the try/catch-return-null
// wrapping dropped: a genuine DB failure now propagates rather than being
// silently reinterpreted as "user not found" (see get-current-user.usecase.ts's
// docstring for why this matters — the old swallow was a latent bug where a
// DB outage got misreported as "not logged in").
// KWM-063 — the columns are named explicitly. `select()` and `returning()`
// return every column the table happens to have, so this used to hand back
// `created_at` as well: a field UserRecord does not declare, which the
// in-memory fake never returned. TypeScript could not catch the difference
// because an over-wide row is still structurally assignable to UserRecord.
//
// The leak is small today and unbounded tomorrow: any column later added to
// `users` would flow out of this repository into everything holding a
// UserRecord, with no compile error and no test. Naming the three columns
// makes the port's shape the query's shape. Found by the contract run against
// a real database — the fake had no way to show it.
const USER_COLUMNS = { id: Users.id, email: Users.email, name: Users.name };

export class DrizzleUserRepository implements UserRepository {
  constructor(private readonly db: Database) {}

  async getUserById(id: number): Promise<UserRecord | null> {
    const [user] = await this.db.select(USER_COLUMNS).from(Users).where(eq(Users.id, id)).execute();
    return user ?? null;
  }

  async getUserByEmail(email: string): Promise<UserRecord | null> {
    const [user] = await this.db
      .select(USER_COLUMNS)
      .from(Users)
      .where(eq(Users.email, email))
      .execute();
    return user ?? null;
  }

  async createUser(email: string, name: string): Promise<UserRecord | null> {
    const [user] = await this.db
      .insert(Users)
      .values({ email, name })
      .returning(USER_COLUMNS)
      .execute();
    return user ?? null;
  }
}
