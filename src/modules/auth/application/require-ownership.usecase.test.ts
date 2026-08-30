import { describe, it, expect } from 'vitest';
import { startSession } from './start-session';
import { InMemorySessionRepository } from '../infrastructure/in-memory-session-repository.adapter';
import { InMemorySessionStore } from '../infrastructure/in-memory-session-store.adapter';
import { InMemorySessionTokenService } from '../infrastructure/in-memory-session-token-service.adapter';
import { InMemoryUserRepository } from '../infrastructure/in-memory-user-repository.adapter';
import { InMemoryRoleRepository } from '../infrastructure/in-memory-role-repository.adapter';
import { requireOwnership } from './require-ownership.usecase';
import { ForbiddenError } from '../domain/errors';

async function signedInAs(userId: number, roles: ('citizen' | 'admin' | 'operator')[]) {
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

describe('requireOwnership', () => {
  it('allows the owner', async () => {
    const deps = await signedInAs(7, ['citizen']);
    const user = await requireOwnership(
      deps.sessionStore,
      deps.sessionTokenService,
      deps.sessionRepository,
      deps.userRepository,
      deps.roleRepository,
      7
    );
    expect(user.userId).toBe(7);
  });

  it('blocks a non-owner with no override roles', async () => {
    const deps = await signedInAs(7, ['citizen']);
    await expect(
      requireOwnership(deps.sessionStore, deps.sessionTokenService, deps.sessionRepository, deps.userRepository, deps.roleRepository, 8)
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('allows a non-owner holding an allowed override role', async () => {
    const deps = await signedInAs(7, ['admin']);
    const user = await requireOwnership(
      deps.sessionStore,
      deps.sessionTokenService,
      deps.sessionRepository,
      deps.userRepository,
      deps.roleRepository,
      8,
      { allowRoles: ['admin'] }
    );
    expect(user.userId).toBe(7);
  });

  it('still blocks a non-owner whose role is not in allowRoles', async () => {
    const deps = await signedInAs(7, ['operator']);
    await expect(
      requireOwnership(deps.sessionStore, deps.sessionTokenService, deps.sessionRepository, deps.userRepository, deps.roleRepository, 8, {
        allowRoles: ['admin'],
      })
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
