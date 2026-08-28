import type { CurrentUser } from './current-user';
import type { Role } from './role';
import { UnauthenticatedError, ForbiddenError } from './errors';

// Pure authorization decisions over an already-resolved CurrentUser — no
// I/O, no ports. Mirrors RewardLedger.applyRedeem throwing
// InsufficientPointsError from Domain (Phase 1): a domain policy enforcing
// itself, not a passive data check performed elsewhere.

export function hasRole(user: CurrentUser, role: Role): boolean {
  return user.roles.includes(role);
}

function hasAnyRole(userRoles: readonly Role[], allowed: readonly Role[]): boolean {
  return userRoles.some((r) => allowed.includes(r));
}

export function requireAuthenticated(user: CurrentUser | null): CurrentUser {
  if (!user) throw new UnauthenticatedError();
  return user;
}

export function requireRole(user: CurrentUser | null, roles: readonly Role[]): CurrentUser {
  const authed = requireAuthenticated(user);
  if (!hasAnyRole(authed.roles, roles)) {
    throw new ForbiddenError(`Requires one of: ${roles.join(', ')}`);
  }
  return authed;
}

export function requireOwnership(
  user: CurrentUser | null,
  ownerId: number,
  opts?: { allowRoles?: readonly Role[] }
): CurrentUser {
  const authed = requireAuthenticated(user);
  if (authed.userId === ownerId) return authed;
  if (opts?.allowRoles && hasAnyRole(authed.roles, opts.allowRoles)) return authed;
  throw new ForbiddenError('Not the resource owner');
}
