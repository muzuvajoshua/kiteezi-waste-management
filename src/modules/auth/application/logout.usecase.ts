import type { SessionStore } from './ports/session-store.port';

export async function logout(sessionStore: SessionStore): Promise<void> {
  await sessionStore.clear();
}
