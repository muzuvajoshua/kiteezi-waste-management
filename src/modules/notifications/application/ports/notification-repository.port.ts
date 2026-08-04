import type { Notification, NotificationType } from '../../domain/notification';

export interface CreateNotificationInput {
  readonly userId: number;
  readonly message: string;
  readonly type: NotificationType;
}

export interface NotificationRepository {
  findUnreadByUserId(userId: number): Promise<Notification[]>;
  findById(id: number): Promise<Notification | null>;
  markRead(id: number): Promise<void>;
  create(input: CreateNotificationInput): Promise<Notification>;
}
