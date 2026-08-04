"use server";

import { requireUser } from '@/modules/auth/presentation/auth-guards';
import { validate } from '@/lib/validation';
import { notificationRepository } from './composition';
import { getUnreadNotifications as getUnreadNotificationsUseCase } from '../application/get-unread-notifications.usecase';
import { markNotificationRead as markNotificationReadUseCase } from '../application/mark-notification-read.usecase';
import { markNotificationReadSchema } from './notification.schemas';

// KWM-009 — thin Presentation adapter: same exported names/shapes as the
// legacy utils/db/actions.ts exports (no caller-visible behavior change).
// Only getUnreadNotifications/markNotificationAsRead are exported here —
// createNotification is deliberately NOT re-exported (see
// ../application/create-notification.usecase.ts's docstring).

export async function getUnreadNotifications() {
  const me = await requireUser();
  const result = await getUnreadNotificationsUseCase(notificationRepository, me.userId);
  if (!result.ok) {
    console.error('Error fetching unread notifications:', result.error.message);
    return [];
  }
  return result.value;
}

export async function markNotificationAsRead(notificationId: number) {
  const me = await requireUser();
  const { notificationId: id } = validate(markNotificationReadSchema, { notificationId });
  const result = await markNotificationReadUseCase(notificationRepository, me, id);
  if (!result.ok) {
    // Today's code lets requireOwnership's ForbiddenError propagate
    // uncaught (it's called outside the DB try/catch) while a DB update
    // failure is swallowed with console.error. Preserve that distinction:
    // an authorization failure must still reject the caller's promise, not
    // be silently swallowed like an infra fault.
    if (result.error.code === 'FORBIDDEN' || result.error.code === 'UNAUTHENTICATED') {
      throw new Error(result.error.message);
    }
    console.error('Error marking notification as read:', result.error.message);
  }
}
