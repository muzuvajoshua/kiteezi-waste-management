// Deliberately NOT imported from utils/db/schema.ts's notificationTypeEnum:
// the Domain layer must not depend on Drizzle even for a type-only import.
// Mirrors the rewards/auth modules' PointKind/Role precedent.
export type NotificationType = 'reward' | 'report_update' | 'collection' | 'system';

// A read notification row. Plain DTO — no invariant to protect, matching
// the original plan's own assessment ("Notification entity is mostly a
// DTO").
export interface Notification {
  readonly id: number;
  readonly userId: number;
  readonly message: string;
  readonly type: NotificationType;
  readonly isRead: boolean;
  readonly createdAt: Date;
}
