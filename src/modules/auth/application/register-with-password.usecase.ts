import { DomainError } from '@/shared/domain/domain-error';
import { type Result, ok, err } from '@/shared/application/result';
import { type AppError, appError, fromDomainError } from '@/shared/application/app-error';
import { assertPasswordAcceptable, normaliseEmail } from '../domain/password';
import type { PasswordHasher } from './ports/password-hasher.port';
import type { IdentityRepository } from './ports/identity-repository.port';
import type { UserRepository } from './ports/user-repository.port';
import type { RoleRepository } from './ports/role-repository.port';
import type { SessionTokenService } from './ports/session-token-service.port';
import type { SessionStore } from './ports/session-store.port';
import type { SessionRepository } from './ports/session-repository.port';
import { startSession } from './start-session';

export interface RegisterWithPasswordInput {
  readonly email: string;
  readonly password: string;
  readonly name?: string;
}

export interface RegisterWithPasswordOutput {
  readonly id: number;
  readonly email: string;
  readonly name: string;
}

// Creates an account with a password identity and signs the person in.
//
// The address is normalised before anything consults it: the unique
// constraint on (provider, provider_subject) is byte-exact, so without
// normalisation 'Citizen@example.com' and 'citizen@example.com' become two
// accounts and which one you reach depends on how you typed it.
export async function registerWithPassword(
  passwordHasher: PasswordHasher,
  identityRepository: IdentityRepository,
  userRepository: UserRepository,
  roleRepository: RoleRepository,
  sessionTokenService: SessionTokenService,
  sessionStore: SessionStore,
  sessionRepository: SessionRepository,
  input: RegisterWithPasswordInput
): Promise<Result<RegisterWithPasswordOutput, AppError>> {
  const email = normaliseEmail(input.email);

  try {
    assertPasswordAcceptable(input.password);
  } catch (error) {
    if (error instanceof DomainError) return err(fromDomainError(error, 'VALIDATION'));
    throw error;
  }

  try {
    // Refuse rather than overwrite. If registering over an existing address
    // replaced the stored hash, anyone could take over a stranger's account
    // by "registering" it again.
    const existingIdentity = await identityRepository.findByProviderSubject('password', email);
    if (existingIdentity) {
      return err(appError('CONFLICT', 'An account already exists for this email address.'));
    }

    // The address may belong to a Google account. Attaching a password here
    // would link a second sign-in method to someone else's account on nothing
    // but a matching address — the same takeover vector establishSession
    // refuses. Linking is a deliberate, authenticated action for a settings
    // page to offer.
    const emailOwner = await userRepository.getUserByEmail(email);
    if (emailOwner) {
      return err(
        appError(
          'CONFLICT',
          'An account already exists for this email address. Sign in with your original method, then add a password from settings.'
        )
      );
    }

    const passwordHash = await passwordHasher.hash(input.password);

    const user = await userRepository.createUser(email, input.name?.trim() || 'Anonymous User');
    if (!user) {
      return err(appError('UNEXPECTED', 'Could not create the account'));
    }

    await identityRepository.link({
      userId: user.id,
      provider: 'password',
      providerSubject: email,
      passwordHash,
    });
    // Every new user starts as a citizen (KWM-008).
    await roleRepository.assignRole(user.id, 'citizen');

    await startSession(sessionTokenService, sessionStore, sessionRepository, user.id);

    return ok({ id: user.id, email: user.email, name: user.name });
  } catch {
    return err(appError('UNEXPECTED', 'Could not create the account'));
  }
}
