import { describe, it, expect } from 'vitest';
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
  userRepository.seed({ id: userId, email: 'a@example.com', name: 'Ada' });
  roleRepository.seedRoles(userId, roles);
  await sessionStore.set(await sessionTokenService.sign({ userId }));
  return { sessionStore, sessionTokenService, userRepository, roleRepository };
}

describe('requireRole', () => {
  it('throws UnauthenticatedError (not Forbidden) when signed out', async () => {
    const sessionStore = new InMemorySessionStore();
    const sessionTokenService = new InMemorySessionTokenService();
    const userRepository = new InMemoryUserRepository();
    const roleRepository = new InMemoryRoleRepository();
    await expect(
      requireRole(sessionStore, sessionTokenService, userRepository, roleRepository, ['admin'])
    ).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it('rejects a citizen asking for admin', async () => {
    const deps = await signedInAs(1, ['citizen']);
    await expect(
      requireRole(deps.sessionStore, deps.sessionTokenService, deps.userRepository, deps.roleRepository, ['admin'])
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('returns the user when a role matches', async () => {
    const deps = await signedInAs(42, ['admin']);
    const user = await requireRole(
      deps.sessionStore,
      deps.sessionTokenService,
      deps.userRepository,
      deps.roleRepository,
      ['admin']
    );
    expect(user.userId).toBe(42);
  });
});
