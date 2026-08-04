import { describe, it, expect } from 'vitest';
import { InMemorySessionStore } from '../infrastructure/in-memory-session-store.adapter';
import { InMemorySessionTokenService } from '../infrastructure/in-memory-session-token-service.adapter';
import { InMemoryUserRepository } from '../infrastructure/in-memory-user-repository.adapter';
import { InMemoryRoleRepository } from '../infrastructure/in-memory-role-repository.adapter';
import { InMemoryIdentityProvider } from '../infrastructure/in-memory-identity-provider.adapter';
import { establishSession } from './establish-session.usecase';

function setup() {
  return {
    identityProvider: new InMemoryIdentityProvider(),
    userRepository: new InMemoryUserRepository(),
    roleRepository: new InMemoryRoleRepository(),
    sessionTokenService: new InMemorySessionTokenService(),
    sessionStore: new InMemorySessionStore(),
  };
}

describe('establishSession', () => {
  it('creates a new user, assigns citizen, and stores a session token', async () => {
    const deps = setup();
    deps.identityProvider.seedToken('tok-1', { email: 'new@example.com', name: 'New Person' });

    const result = await establishSession(
      deps.identityProvider,
      deps.userRepository,
      deps.roleRepository,
      deps.sessionTokenService,
      deps.sessionStore,
      { idToken: 'tok-1' }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({ id: 1, email: 'new@example.com', name: 'New Person' });
    expect(await deps.roleRepository.getUserRoles(1)).toEqual(['citizen']);
    expect(await deps.sessionStore.get()).not.toBeNull();
  });

  it('reuses an existing user by email without re-assigning a role', async () => {
    const deps = setup();
    deps.userRepository.seed({ id: 5, email: 'existing@example.com', name: 'Existing' });
    deps.roleRepository.seedRoles(5, ['admin']);
    deps.identityProvider.seedToken('tok-2', { email: 'existing@example.com' });

    const result = await establishSession(
      deps.identityProvider,
      deps.userRepository,
      deps.roleRepository,
      deps.sessionTokenService,
      deps.sessionStore,
      { idToken: 'tok-2' }
    );

    expect(result).toEqual({ ok: true, value: { id: 5, email: 'existing@example.com', name: 'Existing' } });
    expect(await deps.roleRepository.getUserRoles(5)).toEqual(['admin']); // unchanged, not re-granted
  });

  it('defaults the name to "Anonymous User" when the token has no name claim', async () => {
    const deps = setup();
    deps.identityProvider.seedToken('tok-3', { email: 'noname@example.com' });

    const result = await establishSession(
      deps.identityProvider,
      deps.userRepository,
      deps.roleRepository,
      deps.sessionTokenService,
      deps.sessionStore,
      { idToken: 'tok-3' }
    );

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.name).toBe('Anonymous User');
  });

  it('maps an invalid token to UNAUTHENTICATED', async () => {
    const deps = setup();
    const result = await establishSession(
      deps.identityProvider,
      deps.userRepository,
      deps.roleRepository,
      deps.sessionTokenService,
      deps.sessionStore,
      { idToken: 'unknown-token' }
    );
    expect(result).toEqual({ ok: false, error: { code: 'UNAUTHENTICATED', message: 'Invalid token' } });
  });

  it('maps a token with no email claim to UNAUTHENTICATED', async () => {
    const deps = setup();
    deps.identityProvider.seedToken('tok-4', { name: 'No Email' });
    const result = await establishSession(
      deps.identityProvider,
      deps.userRepository,
      deps.roleRepository,
      deps.sessionTokenService,
      deps.sessionStore,
      { idToken: 'tok-4' }
    );
    expect(result).toEqual({ ok: false, error: { code: 'UNAUTHENTICATED', message: 'Token has no email claim' } });
  });
});
