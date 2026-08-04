import { describe, it, expect } from 'vitest';
import { InMemorySessionStore } from '../infrastructure/in-memory-session-store.adapter';
import { InMemorySessionTokenService } from '../infrastructure/in-memory-session-token-service.adapter';
import { InMemoryUserRepository } from '../infrastructure/in-memory-user-repository.adapter';
import { InMemoryRoleRepository } from '../infrastructure/in-memory-role-repository.adapter';
import { requireAuthenticated } from './require-authenticated.usecase';
import { UnauthenticatedError } from '../domain/errors';

function setup() {
  return {
    sessionStore: new InMemorySessionStore(),
    sessionTokenService: new InMemorySessionTokenService(),
    userRepository: new InMemoryUserRepository(),
    roleRepository: new InMemoryRoleRepository(),
  };
}

describe('requireAuthenticated', () => {
  it('throws UnauthenticatedError when signed out', async () => {
    const { sessionStore, sessionTokenService, userRepository, roleRepository } = setup();
    await expect(
      requireAuthenticated(sessionStore, sessionTokenService, userRepository, roleRepository)
    ).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it('returns the resolved CurrentUser when signed in', async () => {
    const { sessionStore, sessionTokenService, userRepository, roleRepository } = setup();
    userRepository.seed({ id: 1, email: 'a@example.com', name: 'Ada' });
    roleRepository.seedRoles(1, ['citizen']);
    await sessionStore.set(await sessionTokenService.sign({ userId: 1 }));

    const user = await requireAuthenticated(sessionStore, sessionTokenService, userRepository, roleRepository);
    expect(user.userId).toBe(1);
  });
});
