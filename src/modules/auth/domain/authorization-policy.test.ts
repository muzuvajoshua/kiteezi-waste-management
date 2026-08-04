import { describe, it, expect } from 'vitest';
import type { CurrentUser } from './current-user';
import type { Role } from './role';
import { hasRole, requireAuthenticated, requireRole, requireOwnership } from './authorization-policy';
import { UnauthenticatedError, ForbiddenError } from './errors';

function user(userId: number, roles: Role[]): CurrentUser {
  return { userId, email: 'user@example.com', name: 'Test User', roles };
}

describe('hasRole', () => {
  it('checks membership in the roles list', () => {
    expect(hasRole(user(1, ['citizen']), 'citizen')).toBe(true);
    expect(hasRole(user(1, ['citizen']), 'admin')).toBe(false);
  });
});

describe('requireAuthenticated', () => {
  it('returns the user when present', () => {
    const u = user(1, ['citizen']);
    expect(requireAuthenticated(u)).toBe(u);
  });

  it('throws UnauthenticatedError when null', () => {
    expect(() => requireAuthenticated(null)).toThrow(UnauthenticatedError);
  });
});

describe('requireRole', () => {
  it('throws UnauthenticatedError (not Forbidden) when signed out', () => {
    expect(() => requireRole(null, ['admin'])).toThrow(UnauthenticatedError);
  });

  it('rejects a citizen asking for admin', () => {
    expect(() => requireRole(user(1, ['citizen']), ['admin'])).toThrow(ForbiddenError);
  });

  it('rejects when none of several roles match', () => {
    expect(() => requireRole(user(1, ['citizen']), ['supervisor', 'admin'])).toThrow(ForbiddenError);
  });

  it('returns the user when a role matches', () => {
    const u = user(42, ['admin']);
    expect(requireRole(u, ['admin'])).toBe(u);
  });

  it('returns the user when any of several roles matches', () => {
    const u = user(7, ['operator']);
    expect(requireRole(u, ['operator', 'supervisor', 'admin'])).toBe(u);
  });
});

describe('requireOwnership', () => {
  it('allows the owner', () => {
    const u = user(7, ['citizen']);
    expect(requireOwnership(u, 7)).toBe(u);
  });

  it('blocks a non-owner with no override roles', () => {
    expect(() => requireOwnership(user(7, ['citizen']), 8)).toThrow(ForbiddenError);
  });

  it('allows a non-owner holding an allowed override role', () => {
    const u = user(7, ['admin']);
    expect(requireOwnership(u, 8, { allowRoles: ['admin'] })).toBe(u);
  });

  it('still blocks a non-owner whose role is not in allowRoles', () => {
    expect(() => requireOwnership(user(7, ['operator']), 8, { allowRoles: ['admin'] })).toThrow(ForbiddenError);
  });

  it('throws UnauthenticatedError when signed out', () => {
    expect(() => requireOwnership(null, 8)).toThrow(UnauthenticatedError);
  });
});
