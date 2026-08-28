import { type Result, ok, err } from '@/shared/application/result';
import { type AppError, appError } from '@/shared/application/app-error';
import type { Notification } from '../domain/notification';
import type { NotificationRepository } from './ports/notification-repository.port';

export async function getUnreadNotifications(
  repository: NotificationRepository,
  userId: number
): Promise<Result<Notification[], AppError>> {
  try {
    return ok(await repository.findUnreadByUserId(userId));
  } catch {
    return err(appError('UNEXPECTED', 'Failed to fetch unread notifications'));
  }
}
