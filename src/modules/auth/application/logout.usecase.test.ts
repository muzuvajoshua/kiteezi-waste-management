import { describe, it, expect } from 'vitest';
import { InMemorySessionStore } from '../infrastructure/in-memory-session-store.adapter';
import { InMemorySessionTokenService } from '../infrastructure/in-memory-session-token-service.adapter';
import { InMemorySessionRepository } from '../infrastructure/in-memory-session-repository.adapter';
import { startSession } from './start-session';
import { logout } from './logout.usecase';

// The cookie-clearing half. That logout also REVOKES the session server-side
// — the substance of KWM-079 — is covered in session-revocation.test.ts,
// which can assert the property that matters: a captured cookie stops
// working.

describe('logout', () => {
  it('clears the session store', async () => {
    const sessionStore = new InMemorySessionStore();
    const sessionTokenService = new InMemorySessionTokenService();
    const sessionRepository = new InMemorySessionRepository();
    await startSession(sessionTokenService, sessionStore, sessionRepository, 7);

    await logout(sessionStore, sessionTokenService, sessionRepository);

    expect(await sessionStore.get()).toBeNull();
  });

  it('clears the store even when the token cannot be read', async () => {
    // A corrupt cookie must not strand the user in a state they cannot click
    // their way out of.
    const sessionStore = new InMemorySessionStore();
    await sessionStore.set('not-a-valid-token');

    await logout(sessionStore, new InMemorySessionTokenService(), new InMemorySessionRepository());

    expect(await sessionStore.get()).toBeNull();
  });
});
