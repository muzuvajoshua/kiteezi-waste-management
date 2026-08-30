import type { CurrentUser } from '../domain/current-user';
import type { Role } from '../domain/role';
import { requireRole as policyRequireRole } from '../domain/authorization-policy';
import { requireAuthenticated } from './require-authenticated.usecase';
import type { SessionStore } from './ports/session-store.port';
import type { SessionRepository } from './ports/session-repository.port';
import type { SessionTokenService } from './ports/session-token-service.port';
import type { UserRepository } from './ports/user-repository.port';
import type { RoleRepository } from './ports/role-repository.port';

// Requires the caller to hold at least one of the given role(s); throws
// ForbiddenError (or UnauthenticatedError if not signed in). Returns the
// resolved CurrentUser so callers can use the session-derived userId.
export async function requireRole(
  sessionStore: SessionStore,
  sessionTokenService: SessionTokenService,
  sessionRepository: SessionRepository,
  userRepository: UserRepository,
  roleRepository: RoleRepository,
  roles: readonly Role[]
): Promise<CurrentUser> {
  const user = await requireAuthenticated(sessionStore, sessionTokenService, sessionRepository, userRepository, roleRepository);
  return policyRequireRole(user, roles);
}
