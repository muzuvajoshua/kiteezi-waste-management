"use server";

import { headers } from 'next/headers';
import { validate } from '@/lib/validation';
import { actionResult } from '@/shared/presentation/action-result';
import { clientIpFrom } from '@/shared/presentation/client-identity';
import { enforceRateLimit, RATE_LIMITS } from '@/shared/presentation/rate-limit';
import { rateLimiter, emailSender } from '@/shared/presentation/composition';
import type { Result } from '@/shared/application/result';
import type { AppError } from '@/shared/application/app-error';
import {
  identityRepository,
  passwordResetTokenRepository,
  resetTokenService,
  passwordHasher,
  sessionRepository,
} from './composition';
import { requestPasswordReset } from '../application/request-password-reset.usecase';
import { resetPassword } from '../application/reset-password.usecase';
import { normaliseEmail } from '../domain/password';
import { requestPasswordResetSchema, resetPasswordSchema } from './password-reset.schemas';

// Password reset (KWM-059). Unauthenticated by nature — the whole point is
// that the caller cannot sign in — so rate limiting is the only thing
// bounding abuse, and both actions carry it.

/**
 * The absolute URL the emailed link points at.
 *
 * Built from configuration rather than the request's Host header: trusting
 * Host would let an attacker send a reset email pointing at a site they
 * control, and the recipient would see a genuine Kiteezi email carrying a
 * hostile link.
 */
function resetUrlBase(): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : '');

  if (!base) {
    throw new Error('NEXT_PUBLIC_APP_URL is not set; cannot build a password reset link');
  }
  return `${base.replace(/\/$/, '')}/reset-password`;
}

export async function requestPasswordResetAction(
  email: string
): Promise<Result<void, AppError>> {
  return actionResult(async () => {
    const input = validate(requestPasswordResetSchema, { email });

    await enforceRateLimit(rateLimiter, [
      {
        scope: 'passwordReset:email',
        id: normaliseEmail(input.email),
        policy: RATE_LIMITS.passwordResetPerEmail,
      },
      {
        scope: 'passwordReset:ip',
        id: clientIpFrom(await headers()),
        policy: RATE_LIMITS.passwordResetPerIp,
      },
    ]);

    return requestPasswordReset(
      identityRepository,
      passwordResetTokenRepository,
      emailSender,
      resetTokenService,
      { email: input.email, resetUrlBase: resetUrlBase() }
    );
  });
}

export async function resetPasswordAction(
  token: string,
  newPassword: string
): Promise<Result<{ sessionsEnded: number }, AppError>> {
  return actionResult(async () => {
    const input = validate(resetPasswordSchema, { token, newPassword });

    // Per IP: the token is the secret being guessed, so keying on it would
    // give an attacker a fresh budget for every guess.
    await enforceRateLimit(rateLimiter, [
      {
        scope: 'resetPassword:ip',
        id: clientIpFrom(await headers()),
        policy: RATE_LIMITS.passwordResetPerIp,
      },
    ]);

    return resetPassword(
      passwordResetTokenRepository,
      identityRepository,
      passwordHasher,
      resetTokenService,
      sessionRepository,
      { token: input.token, newPassword: input.newPassword }
    );
  });
}
