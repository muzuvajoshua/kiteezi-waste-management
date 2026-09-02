import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { sql } from 'drizzle-orm';
import { createTestDatabase, type TestDatabase } from '@/test-support/pglite-database';
import { Users } from '@/utils/db/schema';
import { DrizzleUserRepository } from './drizzle-user-repository.adapter';
import { testUserRepositoryContract } from './user-repository.contract.test-support';

// KWM-063 — the same contract the in-memory fake passes, run against real
// Postgres.

let database: TestDatabase;

beforeAll(async () => {
  database = await createTestDatabase();
}, 60_000);

beforeEach(async () => {
  await database.reset();
});

afterAll(async () => {
  await database.close();
});

testUserRepositoryContract('DrizzleUserRepository', () => ({
  repository: new DrizzleUserRepository(database.db),
  seedUser: async (id, email, name) => {
    await database.db.insert(Users).values({ id, email, name });
    // Seeding an explicit id does not advance the serial sequence, so the
    // contract's later `createUser` would try to reuse id 1 and hit a
    // duplicate key. The in-memory fake has no sequence and never shows this.
    await database.db.execute(
      sql`SELECT setval(pg_get_serial_sequence('users', 'id'), (SELECT MAX(id) FROM users))`
    );
  },
}));

// Behaviour only a real database exhibits.
describe('DrizzleUserRepository against real Postgres', () => {
  it('refuses a second user with the same email', async () => {
    // users.email is UNIQUE. The fake stores a plain list and would happily
    // keep both, so a duplicate-registration bug could pass every test.
    const repository = new DrizzleUserRepository(database.db);
    await repository.createUser('taken@example.com', 'First');

    await expect(repository.createUser('taken@example.com', 'Second')).rejects.toThrow(
      /unique|duplicate/i
    );
  });

  it('treats emails case-sensitively, as the column is declared', async () => {
    // Documents actual behaviour rather than asserting the desirable one:
    // the column has no citext or lower() index, so these are two rows.
    // Normalisation happens above this layer (see establish-session).
    const repository = new DrizzleUserRepository(database.db);
    await repository.createUser('Case@example.com', 'Upper');

    expect(await repository.getUserByEmail('case@example.com')).toBeNull();
  });

  it('assigns ids from the sequence rather than the caller', async () => {
    const repository = new DrizzleUserRepository(database.db);

    const first = await repository.createUser('a@example.com', 'A');
    const second = await repository.createUser('b@example.com', 'B');

    expect(first?.id).toBe(1);
    expect(second?.id).toBe(2);
  });
});
