import { describe, it, expect } from 'vitest';
import { InMemorySessionStore } from '../infrastructure/in-memory-session-store.adapter';
import { logout } from './logout.usecase';

describe('logout', () => {
  it('clears the session store', async () => {
    const sessionStore = new InMemorySessionStore();
    await sessionStore.set('some-token');

    await logout(sessionStore);

    expect(await sessionStore.get()).toBeNull();
  });
});
