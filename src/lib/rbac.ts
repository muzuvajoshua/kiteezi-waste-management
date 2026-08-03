import { getServerSession } from './session';
import { getUserById } from '@/utils/db/internal';
import { getUserRoles } from '@/utils/db/roles';
import type { Role } from '@/utils/db/schema';

// KWM-009 — server-side authorization primitives.
//
// Every server action and route handler that touches user data derives the
// acting identity through getCurrentUser() (which reads the signed session
// cookie via getServerSession) and gates on roles loaded fresh from the DB.
// Identity is therefore never taken from a client argument — this is what
// closes audit blocker C-4.

/** No (or invalid) session → maps to HTTP 401 in route handlers. */
export class UnauthorizedError extends Error {
  constructor(message = 'Not authenticated') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

/** Authenticated but lacking the required role/ownership → HTTP 403. */
export class ForbiddenError extends Error {
  constructor(message = 'Insufficient permissions') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export interface CurrentUser {
  userId: number;
  email: string;
  name: string;
  roles: Role[];
}

/**
 * Resolves the current user from the session cookie, with roles loaded fresh
 * from the database. Returns null when there is no valid session or the user no
 * longer exists.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await getServerSession();
  if (!session) return null;

  const user = await getUserById(session.userId);
  if (!user) return null;

  const roles = await getUserRoles(session.userId);
  return { userId: user.id, email: user.email, name: user.name, roles };
}

/** Like getCurrentUser but throws UnauthorizedError instead of returning null. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

export function hasRole(user: CurrentUser, role: Role): boolean {
  return user.roles.includes(role);
}

/**
 * Requires the caller to hold at least one of the given role(s); otherwise
 * throws ForbiddenError (or UnauthorizedError if not signed in). Returns the
 * resolved CurrentUser so callers can use the session-derived userId.
 */
export async function requireRole(roles: Role | Role[]): Promise<CurrentUser> {
  const allowed = Array.isArray(roles) ? roles : [roles];
  const user = await requireUser();
  if (!user.roles.some((r) => allowed.includes(r))) {
    throw new ForbiddenError(`Requires one of: ${allowed.join(', ')}`);
  }
  return user;
}

/** Explicit "any of these roles" alias for readability at call sites. */
export async function requireAnyRole(roles: Role[]): Promise<CurrentUser> {
  return requireRole(roles);
}

/**
 * Requires the caller to be the resource owner, or to hold one of opts.allowRoles
 * (e.g. an admin acting on another user's resource). Throws ForbiddenError
 * otherwise.
 */
export async function requireOwnership(
  ownerId: number,
  opts?: { allowRoles?: Role[] }
): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.userId === ownerId) return user;
  if (opts?.allowRoles && user.roles.some((r) => opts.allowRoles!.includes(r))) {
    return user;
  }
  throw new ForbiddenError('Not the resource owner');
}
