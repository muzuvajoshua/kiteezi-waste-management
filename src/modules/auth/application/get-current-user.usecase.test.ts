import { describe, it, expect } from 'vitest';
import { startSession } from './start-session';
import { InMemorySessionRepository } from '../infrastructure/in-memory-session-repository.adapter';
import { InMemorySessionStore } from '../infrastructure/in-memory-session-store.adapter';
import { InMemorySessionTokenService } from '../infrastructure/in-memory-session-token-service.adapter';
import { InMemoryUserRepository } from '../infrastructure/in-memory-user-repository.adapter';
import { InMemoryRoleRepository } from '../infrastructure/in-memory-role-repository.adapter';
import { getCurrentUser } from './get-current-user.usecase';

function setup() {
  return {
    sessionStore: new InMemorySessionStore(),
    sessionRepository: new InMemorySessionRepository(),
    sessionTokenService: new InMemorySessionTokenService(),
    userRepository: new InMemoryUserRepository(),
    roleRepository: new InMemoryRoleRepository(),
  };
}

describe('getCurrentUser', () => {
  it('returns null when no token is stored', async () => {
    const { sessionStore, sessionTokenService, sessionRepository, userRepository, roleRepository } =
      setup();
    expect(await getCurrentUser(sessionStore, sessionTokenService, sessionRepository, userRepository, roleRepository)).toBeNull();
  });

  it('returns null when the token fails to verify', async () => {
    const { sessionStore, sessionTokenService, sessionRepository, userRepository, roleRepository } =
      setup();
    await sessionStore.set('garbage-token');
    expect(await getCurrentUser(sessionStore, sessionTokenService, sessionRepository, userRepository, roleRepository)).toBeNull();
  });

  it('returns null when the token verifies but the user no longer exists', async () => {
    const { sessionStore, sessionTokenService, sessionRepository, userRepository, roleRepository } =
      setup();
    await startSession(sessionTokenService, sessionStore, sessionRepository, 999);
    expect(await getCurrentUser(sessionStore, sessionTokenService, sessionRepository, userRepository, roleRepository)).toBeNull();
  });

  it('resolves the CurrentUser with roles loaded fresh', async () => {
    const { sessionStore, sessionTokenService, sessionRepository, userRepository, roleRepository } =
      setup();
    userRepository.seed({ id: 7, email: 'a@example.com', name: 'Ada' });
    roleRepository.seedRoles(7, ['citizen', 'operator']);
    await startSession(sessionTokenService, sessionStore, sessionRepository, 7);

    const user = await getCurrentUser(sessionStore, sessionTokenService, sessionRepository, userRepository, roleRepository);

    expect(user).toEqual({ userId: 7, email: 'a@example.com', name: 'Ada', roles: ['citizen', 'operator'] });
  });
});
