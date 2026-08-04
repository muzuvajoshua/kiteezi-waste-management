import { type Result, ok, err } from '@/shared/application/result';
import { type AppError, appError } from '@/shared/application/app-error';
import type { IdentityProvider } from './ports/identity-provider.port';
import type { UserRepository } from './ports/user-repository.port';
import type { RoleRepository } from './ports/role-repository.port';
import type { SessionTokenService } from './ports/session-token-service.port';
import type { SessionStore } from './ports/session-store.port';

export interface EstablishSessionInput {
  readonly idToken: string;
}

export interface EstablishSessionOutput {
  readonly id: number;
  readonly email: string;
  readonly name: string;
}

// Verifies an external identity token, upserts the user (new sign-ins start
// as 'citizen'), and mints+stores a session token.
//
// Two SEPARATE try/catch zones, not one blanket catch like earn-points.usecase.ts
// in the rewards module: identityProvider.verifyToken throws on an invalid
// external credential (an expected sign-in failure -> 'UNAUTHENTICATED'),
// while the repository/token/store calls that follow can only fail
// unexpectedly (a real infra fault -> 'UNEXPECTED'). Collapsing these into
// one catch would misreport a DB outage as "bad token".
export async function establishSession(
  identityProvider: IdentityProvider,
  userRepository: UserRepository,
  roleRepository: RoleRepository,
  sessionTokenService: SessionTokenService,
  sessionStore: SessionStore,
  input: EstablishSessionInput
): Promise<Result<EstablishSessionOutput, AppError>> {
  let claims: { email?: string; name?: string };
  try {
    claims = await identityProvider.verifyToken(input.idToken);
  } catch {
    return err(appError('UNAUTHENTICATED', 'Invalid token'));
  }

  const email = claims.email;
  if (!email) {
    return err(appError('UNAUTHENTICATED', 'Token has no email claim'));
  }

  try {
    let user = await userRepository.getUserByEmail(email);
    if (!user) {
      user = await userRepository.createUser(email, claims.name || 'Anonymous User');
      if (user) {
        // Every new user starts as a citizen (KWM-008).
        await roleRepository.assignRole(user.id, 'citizen');
      }
    }
    if (!user) {
      return err(appError('UNEXPECTED', 'Could not resolve user'));
    }

    const token = await sessionTokenService.sign({ userId: user.id });
    await sessionStore.set(token);

    return ok({ id: user.id, email: user.email, name: user.name });
  } catch {
    return err(appError('UNEXPECTED', 'Could not resolve user'));
  }
}
