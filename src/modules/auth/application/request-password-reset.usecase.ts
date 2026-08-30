import { type Result, ok, err } from '@/shared/application/result';
import { type AppError, appError } from '@/shared/application/app-error';
import type { EmailSender } from '@/shared/application/ports/email-sender.port';
import { normaliseEmail } from '../domain/password';
import { PASSWORD_RESET_TTL_SECONDS } from '../domain/password-reset';
import type { IdentityRepository } from './ports/identity-repository.port';
import type { PasswordResetTokenRepository } from './ports/password-reset-token-repository.port';
import type { ResetTokenService } from './ports/reset-token-service.port';

export interface RequestPasswordResetInput {
  readonly email: string;
  /** Absolute URL of the reset page; the token is appended as a query param. */
  readonly resetUrlBase: string;
}

function resetEmail(link: string): { subject: string; text: string } {
  const hours = PASSWORD_RESET_TTL_SECONDS / 3600;
  return {
    subject: 'Reset your Kiteezi password',
    text: [
      'Someone asked to reset the password for your Kiteezi account.',
      '',
      'Open this link to choose a new one:',
      link,
      '',
      `The link stops working in ${hours} hour${hours === 1 ? '' : 's'}, and can only be used once.`,
      '',
      // Says what to do rather than "ignore this email": if the request was
      // not theirs, someone knows their address and may be probing.
      'If you did not ask for this, you can ignore this message — your password has not changed.',
    ].join('\n'),
  };
}

/**
 * Issues a password reset link.
 *
 * ALWAYS returns the same success response, whether or not the address has an
 * account. Reporting "no such account" would make this an account enumerator
 * — and unlike sign-in, this form needs no password to probe, so it is the
 * easier of the two to abuse.
 *
 * That rule extends to failures: a send error is only reachable for an
 * address that DOES exist, so surfacing it would leak the same fact. Send
 * failures are logged server-side and reported to the caller as success.
 *
 * The honest cost of this design: a user whose email genuinely fails to send
 * is told to check their inbox and finds nothing. The alternative leaks which
 * addresses are registered to anyone who asks, which is worse.
 */
export async function requestPasswordReset(
  identityRepository: IdentityRepository,
  tokenRepository: PasswordResetTokenRepository,
  emailSender: EmailSender,
  tokenService: ResetTokenService,
  input: RequestPasswordResetInput
): Promise<Result<void, AppError>> {
  const email = normaliseEmail(input.email);

  try {
    const identity = await identityRepository.findByProviderSubject('password', email);

    // No password identity — either unknown, or a Google-only account with no
    // password to reset. Both return success having done nothing.
    if (!identity?.passwordHash) return ok(undefined);

    const { token, tokenHash } = tokenService.generate();

    await tokenRepository.create({
      userId: identity.userId,
      tokenHash,
      expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_SECONDS * 1000),
    });

    const link = `${input.resetUrlBase}?token=${encodeURIComponent(token)}`;
    const { subject, text } = resetEmail(link);

    try {
      await emailSender.send({ to: email, subject, text });
    } catch (error) {
      // Logged, not surfaced — see the docstring. Deliberately without the
      // address, so logs do not accumulate user emails.
      console.error('Failed to send password reset email:', error);
    }

    return ok(undefined);
  } catch {
    // A repository fault is not an enumeration signal (it happens for any
    // address), so it is reported honestly.
    return err(appError('UNEXPECTED', 'Could not process the request'));
  }
}
