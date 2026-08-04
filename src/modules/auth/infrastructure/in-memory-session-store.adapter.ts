import type { SessionStore } from '../application/ports/session-store.port';

// A single mutable slot simulating one browser's cookie jar.
export class InMemorySessionStore implements SessionStore {
  private token: string | null = null;

  async get(): Promise<string | null> {
    return this.token;
  }

  async set(token: string): Promise<void> {
    this.token = token;
  }

  async clear(): Promise<void> {
    this.token = null;
  }
}
