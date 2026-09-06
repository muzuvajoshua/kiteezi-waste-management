import { eq, and } from 'drizzle-orm';
import type { Database } from '@/shared/infrastructure/persistence/database';
import { Notifications } from '@/utils/db/schema';
import type {
  NotificationRepository,
  CreateNotificationInput,
} from '../application/ports/notification-repository.port';
import type { Notification } from '../domain/notification';

// Relocated from utils/db/actions.ts (reads) and utils/db/internal.ts
// (create). No try/catch: errors propagate, the use-case's try/catch is
// the one mapping point (Phase 1/2 precedent).
export class DrizzleNotificationRepository implements NotificationRepository {
  constructor(private readonly db: Database) {}

  async findUnreadByUserId(userId: number): Promise<Notification[]> {
    return this.db
      .select()
      .from(Notifications)
      .where(and(eq(Notifications.userId, userId), eq(Notifications.isRead, false)))
      .execute();
  }

  async findById(id: number): Promise<Notification | null> {
    const [notification] = await this.db.select().from(Notifications).where(eq(Notifications.id, id)).execute();
    return notification ?? null;
  }

  async markRead(id: number): Promise<void> {
    await this.db.update(Notifications).set({ isRead: true }).where(eq(Notifications.id, id)).execute();
  }

  async create(input: CreateNotificationInput): Promise<Notification> {
    const [notification] = await this.db
      .insert(Notifications)
      .values({ userId: input.userId, message: input.message, type: input.type })
      .returning()
      .execute();
    return notification;
  }
}
