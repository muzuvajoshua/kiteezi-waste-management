import { db } from './dbConfig';
import { Users, Notifications } from './schema';
import type { NotificationType } from './schema';
import { eq } from 'drizzle-orm';

// KWM-009 — internal data-layer helpers.
//
// NOT a "use server" module: anything exported from a "use server" file becomes
// a client-invokable RPC endpoint. These helpers create users and look up
// identities, so they must never be directly reachable from the client. They
// are imported only by trusted server code. Reward-ledger helpers
// (recordPointTransaction/getBalance/getPointTransactions) moved to
// @/modules/rewards/infrastructure as part of the Phase 1 module extraction.

export async function createUser(email: string, name: string) {
  try {
    const [user] = await db.insert(Users).values({ email, name }).returning().execute();
    return user;
  } catch (error) {
    console.error("Error creating user:", error);
    return null;
  }
}

export async function getUserByEmail(email: string) {
  try {
    const [user] = await db.select().from(Users).where(eq(Users.email, email)).execute();
    return user;
  } catch (error) {
    console.error("Error fetching user by email:", error);
    return null;
  }
}

export async function getUserById(id: number) {
  try {
    const [user] = await db.select().from(Users).where(eq(Users.id, id)).execute();
    return user;
  } catch (error) {
    console.error("Error fetching user by id:", error);
    return null;
  }
}

export async function createNotification(userId: number, message: string, type: NotificationType) {
  try {
    const [notification] = await db
      .insert(Notifications)
      .values({ userId, message, type })
      .returning()
      .execute();
    return notification;
  } catch (error) {
    console.error("Error creating notification:", error);
    return null;
  }
}
