import { type Result, ok, err } from '@/shared/application/result';
import { type AppError, appError } from '@/shared/application/app-error';
import type { IdentityProvider } from './ports/identity-provider.port';
import type { IdentityRepository } from './ports/identity-repository.port';
import type { UserRepository } from './ports/user-repository.port';
import type { RoleRepository } from './ports/role-repository.port';
import type { SessionTokenService } from './ports/session-token-service.port';
import type { SessionStore } from './ports/session-store.port';
import type { SessionRepository } from './ports/session-repository.port';
import { startSession } from './start-session';

export interface EstablishSessionInput {
  readonly idToken: string;
}

export interface EstablishSessionOutput {
  readonly id: number;
  readonly email: string;
  readonly name: string;
}

// Verifies an external identity token and establishes a session.
//
// Accounts are resolved by the provider's immutable SUBJECT, never by email.
// The previous version upserted on `getUserByEmail`, which meant any token
// bearing a known address resolved to that account — so a token from a
// different Google account with a matching email claim inherited it. Subject
// keying removes that entirely: a new subject is a new identity, full stop.
//
// Two SEPARATE try/catch zones, not one blanket catch: verifyToken throws on
// an invalid external credential (an expected sign-in failure ->
// UNAUTHENTICATED), while the repository/token/store calls that follow can
// only fail unexpectedly (a real infra fault -> UNEXPECTED). Collapsing them
// would misreport a database outage as "bad token".
export async function establishSession(
  identityProvider: IdentityProvider,
  identityRepository: IdentityRepository,
  userRepository: UserRepository,
  roleRepository: RoleRepository,
  sessionTokenService: SessionTokenService,
  sessionStore: SessionStore,
  sessionRepository: SessionRepository,
  input: EstablishSessionInput
): Promise<Result<EstablishSessionOutput, AppError>> {
  let identity;
  try {
    identity = await identityProvider.verifyToken(input.idToken);
  } catch {
    return err(appError('UNAUTHENTICATED', 'Invalid token'));
  }

  if (!identity.email) {
    return err(appError('UNAUTHENTICATED', 'Token has no email claim'));
  }

  try {
    const existing = await identityRepository.findByProviderSubject(
      'google',
      identity.subject
    );

    if (existing) {
      const user = await userRepository.getUserById(existing.userId);
      if (!user) {
        // An identity row outlived its user. The FK is ON DELETE CASCADE, so
        // this should be unreachable; report it rather than silently creating
        // a replacement account under the same identity.
        return err(appError('UNEXPECTED', 'Could not resolve user'));
      }

      await startSession(sessionTokenService, sessionStore, sessionRepository, user.id);
      return ok({ id: user.id, email: user.email, name: user.name });
    }

    // First sign-in for this subject. An unverified address must not be
    // trusted here: it is the only thing linking this new identity to a
    // human, and Google itself declines to vouch for it.
    if (!identity.emailVerified) {
      return err(appError('UNAUTHENTICATED', 'Email address is not verified'));
    }

    // A matching address on an account this subject does not own is refused,
    // not adopted. Auto-linking on email is the takeover vector; linking a
    // second provider to an existing account is a deliberate, authenticated
    // action for a settings page to offer, not something sign-in infers.
    const emailOwner = await userRepository.getUserByEmail(identity.email);
    if (emailOwner) {
      return err(
        appError(
          'CONFLICT',
          'An account already exists for this email address. Sign in with your original method, then link this one from settings.'
        )
      );
    }

    const user = await userRepository.createUser(identity.email, identity.name || 'Anonymous User');
    if (!user) {
      return err(appError('UNEXPECTED', 'Could not resolve user'));
    }

    await identityRepository.link({
      userId: user.id,
      provider: 'google',
      providerSubject: identity.subject,
    });
    // Every new user starts as a citizen (KWM-008).
    await roleRepository.assignRole(user.id, 'citizen');

    await startSession(sessionTokenService, sessionStore, sessionRepository, user.id);

    return ok({ id: user.id, email: user.email, name: user.name });
  } catch {
    return err(appError('UNEXPECTED', 'Could not resolve user'));
  }
}
