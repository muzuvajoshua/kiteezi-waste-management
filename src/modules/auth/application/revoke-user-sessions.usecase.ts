import { type Result, ok, err } from '@/shared/application/result';
import { type AppError, appError } from '@/shared/application/app-error';
import type { SessionRepository } from './ports/session-repository.port';

export interface RevokeUserSessionsOutput {
  readonly sessionsEnded: number;
}

/**
 * Ends every live session for a user.
 *
 * Two callers: a password reset (whoever knew the old password must lose
 * access, otherwise the reset protects nobody), and an administrator
 * terminating a compromised or offboarded account.
 *
 * Returns the count so the caller can say how many devices were signed out —
 * which is how someone notices one they do not recognise.
 */
export async function revokeUserSessions(
  sessionRepository: SessionRepository,
  userId: number
): Promise<Result<RevokeUserSessionsOutput, AppError>> {
  try {
    return ok({ sessionsEnded: await sessionRepository.revokeAllForUser(userId) });
  } catch {
    return err(appError('UNEXPECTED', 'Could not end the sessions'));
  }
}
