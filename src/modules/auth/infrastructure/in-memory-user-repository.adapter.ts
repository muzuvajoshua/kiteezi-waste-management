import type { UserRepository, UserRecord } from '../application/ports/user-repository.port';

export class InMemoryUserRepository implements UserRepository {
  private readonly usersById = new Map<number, UserRecord>();
  private nextId = 1;

  seed(user: UserRecord): void {
    this.usersById.set(user.id, user);
    if (user.id >= this.nextId) this.nextId = user.id + 1;
  }

  async getUserById(id: number): Promise<UserRecord | null> {
    return this.usersById.get(id) ?? null;
  }

  async getUserByEmail(email: string): Promise<UserRecord | null> {
    for (const user of this.usersById.values()) {
      if (user.email === email) return user;
    }
    return null;
  }

  async createUser(email: string, name: string): Promise<UserRecord | null> {
    const user: UserRecord = { id: this.nextId++, email, name };
    this.usersById.set(user.id, user);
    return user;
  }
}
