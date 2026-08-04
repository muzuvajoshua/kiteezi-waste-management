import type {
  NotificationRepository,
  CreateNotificationInput,
} from '../application/ports/notification-repository.port';
import type { Notification } from '../domain/notification';

export class InMemoryNotificationRepository implements NotificationRepository {
  private readonly notifications = new Map<number, Notification>();
  private nextId = 1;

  seed(notification: Notification): void {
    this.notifications.set(notification.id, notification);
    if (notification.id >= this.nextId) this.nextId = notification.id + 1;
  }

  async findUnreadByUserId(userId: number): Promise<Notification[]> {
    return [...this.notifications.values()].filter((n) => n.userId === userId && !n.isRead);
  }

  async findById(id: number): Promise<Notification | null> {
    return this.notifications.get(id) ?? null;
  }

  async markRead(id: number): Promise<void> {
    const notification = this.notifications.get(id);
    if (notification) this.notifications.set(id, { ...notification, isRead: true });
  }

  async create(input: CreateNotificationInput): Promise<Notification> {
    const notification: Notification = {
      id: this.nextId++,
      userId: input.userId,
      message: input.message,
      type: input.type,
      isRead: false,
      createdAt: new Date(),
    };
    this.notifications.set(notification.id, notification);
    return notification;
  }
}
