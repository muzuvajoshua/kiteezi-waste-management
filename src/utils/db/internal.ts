import { db } from './dbConfig';
import { Notifications } from './schema';
import type { NotificationType } from './schema';

// KWM-009 — internal data-layer helpers.
//
// NOT a "use server" module: anything exported from a "use server" file becomes
// a client-invokable RPC endpoint. This helper creates notifications, so it
// must never be directly reachable from the client. It is imported only by
// trusted server code. Reward-ledger helpers moved to
// @/modules/rewards/infrastructure (Phase 1); user/role helpers moved to
// @/modules/auth/infrastructure (Phase 2).

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
