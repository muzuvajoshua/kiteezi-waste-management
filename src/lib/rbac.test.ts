import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the three dependencies of rbac.ts so the tests are pure units: no DB,
// no cookies. (These replacements also stop the real modules — which import
// neon / next/headers — from loading.)
vi.mock('./session', () => ({ getServerSession: vi.fn() }));
vi.mock('@/utils/db/internal', () => ({ getUserById: vi.fn() }));
vi.mock('@/utils/db/roles', () => ({ getUserRoles: vi.fn() }));

import { getServerSession } from './session';
import { getUserById } from '@/utils/db/internal';
import { getUserRoles } from '@/utils/db/roles';
import type { Role } from '@/utils/db/schema';
import {
  getCurrentUser,
  requireUser,
  requireRole,
  requireAnyRole,
  requireOwnership,
  UnauthorizedError,
  ForbiddenError,
} from './rbac';

const mockSession = vi.mocked(getServerSession);
const mockUserById = vi.mocked(getUserById);
const mockRoles = vi.mocked(getUserRoles);

function signedInAs(userId: number, roles: Role[]) {
  mockSession.mockResolvedValue({ userId });
  mockUserById.mockResolvedValue({
    id: userId,
    email: 'user@example.com',
    name: 'Test User',
    created_at: new Date(),
  });
  mockRoles.mockResolvedValue(roles);
}

function signedOut() {
  mockSession.mockResolvedValue(null);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('unauthorized (401) — no session', () => {
  it('getCurrentUser returns null', async () => {
    signedOut();
    expect(await getCurrentUser()).toBeNull();
  });

  it('requireUser throws UnauthorizedError', async () => {
    signedOut();
    await expect(requireUser()).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('requireRole throws UnauthorizedError (not Forbidden) when signed out', async () => {
    signedOut();
    await expect(requireRole(['admin'])).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

describe('forbidden (403) — wrong role', () => {
  it('requireRole rejects a citizen asking for admin', async () => {
    signedInAs(1, ['citizen']);
    await expect(requireRole(['admin'])).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('requireRole rejects when none of several roles match', async () => {
    signedInAs(1, ['citizen']);
    await expect(requireRole(['supervisor', 'admin'])).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('authorized role access', () => {
  it('requireRole returns the session user when the role matches', async () => {
    signedInAs(42, ['admin']);
    const user = await requireRole(['admin']);
    expect(user.userId).toBe(42);
    expect(user.roles).toContain('admin');
  });

  it('requireRole accepts a single (non-array) role', async () => {
    signedInAs(5, ['supervisor']);
    const user = await requireRole('supervisor');
    expect(user.userId).toBe(5);
  });

  it('requireAnyRole passes when the user holds one of the listed roles', async () => {
    signedInAs(7, ['operator']);
    const user = await requireAnyRole(['operator', 'supervisor', 'admin']);
    expect(user.userId).toBe(7);
  });
});

describe('ownership checks', () => {
  it('allows the owner', async () => {
    signedInAs(7, ['citizen']);
    const user = await requireOwnership(7);
    expect(user.userId).toBe(7);
  });

  it('blocks a non-owner with no override roles', async () => {
    signedInAs(7, ['citizen']);
    await expect(requireOwnership(8)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('allows a non-owner holding an allowed override role', async () => {
    signedInAs(7, ['admin']);
    const user = await requireOwnership(8, { allowRoles: ['admin'] });
    expect(user.userId).toBe(7);
  });

  it('still blocks a non-owner whose role is not in allowRoles', async () => {
    signedInAs(7, ['operator']);
    await expect(requireOwnership(8, { allowRoles: ['admin'] })).rejects.toBeInstanceOf(ForbiddenError);
  });
});
