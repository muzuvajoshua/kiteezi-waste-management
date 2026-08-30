import { describe, it, expect } from 'vitest';
import { startSession } from './start-session';
import { InMemorySessionRepository } from '../infrastructure/in-memory-session-repository.adapter';
import { InMemorySessionStore } from '../infrastructure/in-memory-session-store.adapter';
import { InMemorySessionTokenService } from '../infrastructure/in-memory-session-token-service.adapter';
import { InMemoryUserRepository } from '../infrastructure/in-memory-user-repository.adapter';
import { InMemoryRoleRepository } from '../infrastructure/in-memory-role-repository.adapter';
import { requireRole } from './require-role.usecase';
import { UnauthenticatedError, ForbiddenError } from '../domain/errors';

async function signedInAs(userId: number, roles: ('citizen' | 'operator' | 'supervisor' | 'admin' | 'dump_op')[]) {
  const sessionStore = new InMemorySessionStore();
  const sessionTokenService = new InMemorySessionTokenService();
  const userRepository = new InMemoryUserRepository();
  const roleRepository = new InMemoryRoleRepository();
  const sessionRepository = new InMemorySessionRepository();
  userRepository.seed({ id: userId, email: 'a@example.com', name: 'Ada' });
  roleRepository.seedRoles(userId, roles);
  await startSession(sessionTokenService, sessionStore, sessionRepository, userId);
  return { sessionStore, sessionTokenService, sessionRepository, userRepository, roleRepository };
}

describe('requireRole', () => {
  it('throws UnauthenticatedError (not Forbidden) when signed out', async () => {
    const sessionStore = new InMemorySessionStore();
    const sessionTokenService = new InMemorySessionTokenService();
    const userRepository = new InMemoryUserRepository();
    const roleRepository = new InMemoryRoleRepository();
  const sessionRepository = new InMemorySessionRepository();
    await expect(
      requireRole(sessionStore, sessionTokenService, sessionRepository, userRepository, roleRepository, ['admin'])
    ).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it('rejects a citizen asking for admin', async () => {
    const deps = await signedInAs(1, ['citizen']);
    await expect(
      requireRole(deps.sessionStore, deps.sessionTokenService, deps.sessionRepository, deps.userRepository, deps.roleRepository, ['admin'])
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('returns the user when a role matches', async () => {
    const deps = await signedInAs(42, ['admin']);
    const user = await requireRole(
      deps.sessionStore,
      deps.sessionTokenService,
      deps.sessionRepository,
      deps.userRepository,
      deps.roleRepository,
      ['admin']
    );
    expect(user.userId).toBe(42);
  });
});
