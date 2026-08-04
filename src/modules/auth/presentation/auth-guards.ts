import type { Role } from '../domain/role';
import type { CurrentUser } from '../domain/current-user';
import { sessionStore, sessionTokenService, userRepository, roleRepository } from './composition';
import { getCurrentUser as getCurrentUserUseCase } from '../application/get-current-user.usecase';
import { requireAuthenticated as requireAuthenticatedUseCase } from '../application/require-authenticated.usecase';
import { requireRole as requireRoleUseCase } from '../application/require-role.usecase';
import { requireOwnership as requireOwnershipUseCase } from '../application/require-ownership.usecase';

// KWM-009 — server-side authorization primitives, same public names as the
// legacy lib/rbac.ts they replace. Zero-arg/thin: composes the use-cases
// above with this module's composed adapters (./composition), so every
// other module keeps calling requireUser()/requireRole()/requireOwnership()
// exactly as before — only the import path changes.

export async function getCurrentUser(): Promise<CurrentUser | null> {
  return getCurrentUserUseCase(sessionStore, sessionTokenService, userRepository, roleRepository);
}

/** Like getCurrentUser but throws UnauthenticatedError instead of returning null. */
export async function requireUser(): Promise<CurrentUser> {
  return requireAuthenticatedUseCase(sessionStore, sessionTokenService, userRepository, roleRepository);
}

/**
 * Requires the caller to hold at least one of the given role(s); otherwise
 * throws ForbiddenError (or UnauthenticatedError if not signed in). Returns
 * the resolved CurrentUser so callers can use the session-derived userId.
 */
export async function requireRole(roles: Role | Role[]): Promise<CurrentUser> {
  const allowed = Array.isArray(roles) ? roles : [roles];
  return requireRoleUseCase(sessionStore, sessionTokenService, userRepository, roleRepository, allowed);
}

/** Explicit "any of these roles" alias for readability at call sites. */
export async function requireAnyRole(roles: Role[]): Promise<CurrentUser> {
  return requireRole(roles);
}

/**
 * Requires the caller to be the resource owner, or to hold one of
 * opts.allowRoles (e.g. an admin acting on another user's resource). Throws
 * ForbiddenError otherwise.
 */
export async function requireOwnership(
  ownerId: number,
  opts?: { allowRoles?: Role[] }
): Promise<CurrentUser> {
  return requireOwnershipUseCase(sessionStore, sessionTokenService, userRepository, roleRepository, ownerId, opts);
}
