import type { CurrentUser } from '../domain/current-user';
import { requireAuthenticated as policyRequireAuthenticated } from '../domain/authorization-policy';
import { getCurrentUser } from './get-current-user.usecase';
import type { SessionStore } from './ports/session-store.port';
import type { SessionTokenService } from './ports/session-token-service.port';
import type { UserRepository } from './ports/user-repository.port';
import type { RoleRepository } from './ports/role-repository.port';

// Like getCurrentUser but throws UnauthenticatedError instead of returning
// null. Port I/O happens only inside getCurrentUser; this just applies the
// domain policy's decision to the result.
export async function requireAuthenticated(
  sessionStore: SessionStore,
  sessionTokenService: SessionTokenService,
  userRepository: UserRepository,
  roleRepository: RoleRepository
): Promise<CurrentUser> {
  const user = await getCurrentUser(sessionStore, sessionTokenService, userRepository, roleRepository);
  return policyRequireAuthenticated(user);
}
