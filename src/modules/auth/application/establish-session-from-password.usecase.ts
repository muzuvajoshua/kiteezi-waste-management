import { type Result, ok, err } from '@/shared/application/result';
import { type AppError, appError } from '@/shared/application/app-error';
import { normaliseEmail } from '../domain/password';
import type { PasswordHasher } from './ports/password-hasher.port';
import type { IdentityRepository } from './ports/identity-repository.port';
import type { UserRepository } from './ports/user-repository.port';
import type { SessionTokenService } from './ports/session-token-service.port';
import type { SessionStore } from './ports/session-store.port';

export interface EstablishSessionFromPasswordInput {
  readonly email: string;
  readonly password: string;
}

export interface EstablishSessionFromPasswordOutput {
  readonly id: number;
  readonly email: string;
  readonly name: string;
}

// A hash of a value nobody supplies, verified against when no password
// identity exists for the address. It costs the same as verifying a real one,
// which is what stops response time from revealing whether an address is
// registered.
//
// Cached per hasher rather than per call: computing it fresh each time would
// double the work on the unknown-address path and reintroduce the timing
// difference from the other direction. Keyed weakly so a test hasher does not
// keep its instance alive.
const DUMMY_HASH_BY_HASHER = new WeakMap<PasswordHasher, Promise<string>>();

function dummyHashFor(passwordHasher: PasswordHasher): Promise<string> {
  let promise = DUMMY_HASH_BY_HASHER.get(passwordHasher);
  if (!promise) {
    promise = passwordHasher.hash('unreachable placeholder credential');
    DUMMY_HASH_BY_HASHER.set(passwordHasher, promise);
  }
  return promise;
}

// Signs a person in with an email address and a password.
//
// Every failure returns the SAME error. Distinguishing "no such account" from
// "wrong password" turns the sign-in form into an account-enumeration oracle:
// an attacker learns which addresses are registered, which is worth having by
// itself and makes credential stuffing cheaper.
//
// The identical message is only half of it — see dummyHashFor above for why
// the unknown-address path still pays for a hash.
export async function establishSessionFromPassword(
  passwordHasher: PasswordHasher,
  identityRepository: IdentityRepository,
  userRepository: UserRepository,
  sessionTokenService: SessionTokenService,
  sessionStore: SessionStore,
  input: EstablishSessionFromPasswordInput
): Promise<Result<EstablishSessionFromPasswordOutput, AppError>> {
  const email = normaliseEmail(input.email);
  const rejected = err(appError('UNAUTHENTICATED', 'Incorrect email address or password.'));

  try {
    const identity = await identityRepository.findByProviderSubject('password', email);

    // No password identity: either the address is unknown, or it belongs to a
    // Google-only account. Both still verify against the dummy hash, so the
    // work done is the same either way.
    if (!identity?.passwordHash) {
      await passwordHasher.verify(input.password, await dummyHashFor(passwordHasher));
      return rejected;
    }

    const matches = await passwordHasher.verify(input.password, identity.passwordHash);
    if (!matches) return rejected;

    const user = await userRepository.getUserById(identity.userId);
    if (!user) {
      // The identity outlived its user. The FK is ON DELETE CASCADE so this
      // should be unreachable; report it rather than signing in a ghost.
      return err(appError('UNEXPECTED', 'Could not resolve user'));
    }

    await sessionStore.set(await sessionTokenService.sign({ userId: user.id }));

    return ok({ id: user.id, email: user.email, name: user.name });
  } catch {
    return err(appError('UNEXPECTED', 'Could not sign in'));
  }
}
