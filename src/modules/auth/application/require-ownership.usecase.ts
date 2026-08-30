import type { CurrentUser } from '../domain/current-user';
import type { Role } from '../domain/role';
import { requireOwnership as policyRequireOwnership } from '../domain/authorization-policy';
import { requireAuthenticated } from './require-authenticated.usecase';
import type { SessionStore } from './ports/session-store.port';
import type { SessionRepository } from './ports/session-repository.port';
import type { SessionTokenService } from './ports/session-token-service.port';
import type { UserRepository } from './ports/user-repository.port';
import type { RoleRepository } from './ports/role-repository.port';

// Requires the caller to be the resource owner, or to hold one of
// opts.allowRoles (e.g. an admin acting on another user's resource). Throws
// ForbiddenError otherwise (or UnauthenticatedError if not signed in).
export async function requireOwnership(
  sessionStore: SessionStore,
  sessionTokenService: SessionTokenService,
  sessionRepository: SessionRepository,
  userRepository: UserRepository,
  roleRepository: RoleRepository,
  ownerId: number,
  opts?: { allowRoles?: readonly Role[] }
): Promise<CurrentUser> {
  const user = await requireAuthenticated(sessionStore, sessionTokenService, sessionRepository, userRepository, roleRepository);
  return policyRequireOwnership(user, ownerId, opts);
}
