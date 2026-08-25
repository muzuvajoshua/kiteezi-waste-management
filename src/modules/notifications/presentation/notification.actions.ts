"use server";

import { requireUser } from '@/modules/auth/presentation/auth-guards';
import { validate } from '@/lib/validation';
import { actionResult } from '@/shared/presentation/action-result';
import type { Result } from '@/shared/application/result';
import type { AppError } from '@/shared/application/app-error';
import { notificationRepository } from './composition';
import { getUnreadNotifications as getUnreadNotificationsUseCase } from '../application/get-unread-notifications.usecase';
import { markNotificationRead as markNotificationReadUseCase } from '../application/mark-notification-read.usecase';
import type { Notification } from '../domain/notification';
import { markNotificationReadSchema } from './notification.schemas';

// KWM-009/019 — thin Presentation adapter. `createNotification` is
// deliberately NOT re-exported (see ../application/create-notification.usecase.ts).
//
// KWM-019 removed this file's special case. It used to rethrow a FORBIDDEN
// Result as a plain Error while swallowing infrastructure faults with a
// console.error, precisely so an authorization failure could not be mistaken
// for a silent no-op. That distinction is now carried by the returned
// `AppError.code`, so the hand-rolled split is unnecessary — and the rethrow
// was actively counterproductive here, because Next.js redacts thrown Server
// Action errors in production, replacing "Not the resource owner" with an
// opaque digest.

export async function getUnreadNotifications(): Promise<Result<Notification[], AppError>> {
  return actionResult(async () => {
    const me = await requireUser();
    return getUnreadNotificationsUseCase(notificationRepository, me.userId);
  });
}

export async function markNotificationAsRead(
  notificationId: number
): Promise<Result<void, AppError>> {
  return actionResult(async () => {
    const me = await requireUser();
    const { notificationId: id } = validate(markNotificationReadSchema, { notificationId });
    return markNotificationReadUseCase(notificationRepository, me, id);
  });
}
