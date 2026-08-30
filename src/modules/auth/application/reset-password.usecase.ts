import { DomainError } from '@/shared/domain/domain-error';
import { type Result, ok, err } from '@/shared/application/result';
import { type AppError, appError, fromDomainError } from '@/shared/application/app-error';
import { assertPasswordAcceptable } from '../domain/password';
import type { PasswordHasher } from './ports/password-hasher.port';
import type { IdentityRepository } from './ports/identity-repository.port';
import type { PasswordResetTokenRepository } from './ports/password-reset-token-repository.port';
import type { ResetTokenService } from './ports/reset-token-service.port';

export interface ResetPasswordInput {
  readonly token: string;
  readonly newPassword: string;
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
 */
export async function resetPassword(
  tokenRepository: PasswordResetTokenRepository,
  identityRepository: IdentityRepository,
  passwordHasher: PasswordHasher,
  tokenService: ResetTokenService,
  input: ResetPasswordInput
): Promise<Result<void, AppError>> {
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

    return ok(undefined);
  } catch {
    return err(appError('UNEXPECTED', 'Could not reset the password'));
  }
}
