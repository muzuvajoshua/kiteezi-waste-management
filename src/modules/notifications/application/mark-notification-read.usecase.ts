import { type Result, ok, err } from '@/shared/application/result';
import { type AppError, appError, fromDomainError } from '@/shared/application/app-error';
import { requireOwnership } from '@/modules/auth/domain/authorization-policy';
import { UnauthenticatedError, ForbiddenError } from '@/modules/auth/domain/errors';
import type { CurrentUser } from '@/modules/auth/domain/current-user';
import type { NotificationRepository } from './ports/notification-repository.port';

// Cross-module Domain import (auth/domain/authorization-policy), deliberate:
// this use-case already receives the resolved CurrentUser from its caller
// (Presentation calls requireUser() once, same as today's rbac-era code),
// so routing through auth's require-ownership.usecase.ts instead would
// re-derive the user from 4 ports for no reason. The ownership check can't
// run until AFTER the notification is fetched (its userId is the ownerId),
// which is also why this isn't a simple "guard first" shape.
export async function markNotificationRead(
  repository: NotificationRepository,
  currentUser: CurrentUser,
  notificationId: number
): Promise<Result<void, AppError>> {
  try {
    const notification = await repository.findById(notificationId);
    if (!notification) return ok(undefined); // matches today's silent no-op on a missing id

    requireOwnership(currentUser, notification.userId, { allowRoles: ['admin'] });

    await repository.markRead(notificationId);
    return ok(undefined);
  } catch (error) {
    if (error instanceof UnauthenticatedError) return err(fromDomainError(error, 'UNAUTHENTICATED'));
    if (error instanceof ForbiddenError) return err(fromDomainError(error, 'FORBIDDEN'));
    return err(appError('UNEXPECTED', 'Failed to mark notification as read'));
  }
}
