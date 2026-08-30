import { DomainError } from '@/shared/domain/domain-error';
import { type Result, ok, err } from '@/shared/application/result';
import { type AppError, appError, fromDomainError } from '@/shared/application/app-error';
import { assertPasswordAcceptable } from '../domain/password';
import type { PasswordHasher } from './ports/password-hasher.port';
import type { IdentityRepository } from './ports/identity-repository.port';
import type { PasswordResetTokenRepository } from './ports/password-reset-token-repository.port';
import type { ResetTokenService } from './ports/reset-token-service.port';
import type { SessionRepository } from './ports/session-repository.port';

export interface ResetPasswordInput {
  readonly token: string;
  readonly newPassword: string;
}

export interface ResetPasswordOutput {
  /**
   * How many signed-in devices were signed out.
   *
   * Surfaced so the user can be told — an unexpected count is how someone
   * discovers a session they did not recognise.
   */
  readonly sessionsEnded: number;
}

/**
 * Consumes a reset link and sets a new password.
 *
 * Every bad-token outcome — unknown, expired, already used — returns the SAME
 * error. Distinguishing them tells an attacker whether a guessed token ever
 * existed, which is the same reasoning that makes sign-in report one message
 * for both a wrong password and an unknown address.
 *
 * The token is looked up by its hash, so no raw token is ever compared and
 * the lookup stays one indexed query.
 *
 * A successful reset ENDS EVERY EXISTING SESSION for that user (KWM-079).
 * Without it the reset protects nobody: someone who signed in with the old
 * password — which is the case a reset most often exists to handle — simply
 * stays signed in, for up to the seven days the session cookie remains valid.
 */
export async function resetPassword(
  tokenRepository: PasswordResetTokenRepository,
  identityRepository: IdentityRepository,
  passwordHasher: PasswordHasher,
  tokenService: ResetTokenService,
  sessionRepository: SessionRepository,
  input: ResetPasswordInput
): Promise<Result<ResetPasswordOutput, AppError>> {
  const rejected = err(
    appError('UNAUTHENTICATED', 'This reset link is invalid or has expired. Please request a new one.')
  );

  if (!input.token) return rejected;

  try {
    const record = await tokenRepository.findByTokenHash(tokenService.hash(input.token));

    if (!record) return rejected;
    if (record.usedAt !== null) return rejected;
    if (record.expiresAt.getTime() <= Date.now()) return rejected;

    // Checked AFTER the token, so a weak password cannot be used to probe
    // whether a token is valid — but BEFORE anything is written, so a
    // rejected password leaves the link usable. The user is mid-flow and
    // should be able to try a better one.
    try {
      assertPasswordAcceptable(input.newPassword);
    } catch (error) {
      if (error instanceof DomainError) return err(fromDomainError(error, 'VALIDATION'));
      throw error;
    }

    const updated = await identityRepository.updatePasswordHash(
      record.userId,
      await passwordHasher.hash(input.newPassword)
    );

    if (!updated) {
      // The token resolved to a user with no password identity. Reporting
      // success here would tell the person their password changed when
      // nothing did.
      return err(appError('UNEXPECTED', 'Could not reset the password'));
    }

    await tokenRepository.markUsed(record.id);
    // Kills every OTHER outstanding link for this user — including one an
    // attacker requested — the moment the real owner sets a password.
    await tokenRepository.invalidateAllForUser(record.userId);

    // And every existing session, so whoever knew the old password loses
    // access. Done AFTER the password is stored: revoking first would leave
    // a window where the old password still worked but sessions were gone.
    const sessionsEnded = await sessionRepository.revokeAllForUser(record.userId);

    return ok({ sessionsEnded });
  } catch {
    return err(appError('UNEXPECTED', 'Could not reset the password'));
  }
}
