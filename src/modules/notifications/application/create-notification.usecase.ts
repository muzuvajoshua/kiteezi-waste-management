import { type Result, ok, err } from '@/shared/application/result';
import { type AppError, appError } from '@/shared/application/app-error';
import type { Notification, NotificationType } from '../domain/notification';
import type { NotificationRepository } from './ports/notification-repository.port';

// `userId` is an explicit TARGET, not the session actor (KWM-009's
// actor/target rule — mirrors why this lived in non-"use server"
// utils/db/internal.ts before this module existed). Deliberately NEVER
// exported from notification.actions.ts: exposing it there would let any
// client mint arbitrary notifications for arbitrary users. Only another
// module's Application layer may call this directly (e.g. reports'
// create-report.usecase.ts, the same shape it already uses to call
// rewards' earnPoints).
export async function createNotification(
  repository: NotificationRepository,
  userId: number,
  message: string,
  type: NotificationType
): Promise<Result<Notification, AppError>> {
  try {
    return ok(await repository.create({ userId, message, type }));
  } catch {
    return err(appError('UNEXPECTED', 'Failed to create notification'));
  }
}
