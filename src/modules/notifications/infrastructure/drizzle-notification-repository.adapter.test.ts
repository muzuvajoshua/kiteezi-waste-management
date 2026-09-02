import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { createTestDatabase, seedUsers, type TestDatabase } from '@/test-support/pglite-database';
import { DrizzleNotificationRepository } from './drizzle-notification-repository.adapter';
import { testNotificationRepositoryContract } from './notification-repository.contract.test-support';

// KWM-063 — the same contract the in-memory fake passes, run against real
// Postgres.

let database: TestDatabase;

beforeAll(async () => {
  database = await createTestDatabase();
}, 60_000);

beforeEach(async () => {
  await database.reset();
  await seedUsers(database.db);
});

afterAll(async () => {
  await database.close();
});

testNotificationRepositoryContract('DrizzleNotificationRepository', () => ({
  repository: new DrizzleNotificationRepository(database.db),
}));

describe('DrizzleNotificationRepository against real Postgres', () => {
  it('refuses a notification for a user that does not exist', async () => {
    const repository = new DrizzleNotificationRepository(database.db);

    await expect(
      repository.create({ userId: 9999, message: 'x', type: 'system' })
    ).rejects.toThrow(/foreign key|violates/i);
  });

  it('rejects a type outside the notification_type enum', async () => {
    // The column is a Postgres enum. The fake accepts any string, so a typo
    // in a caller would surface only in production.
    const repository = new DrizzleNotificationRepository(database.db);

    await expect(
      repository.create({
        userId: 1,
        message: 'x',
        type: 'not_a_type' as unknown as 'system',
      })
    ).rejects.toThrow(/invalid input value for enum|not_a_type/i);
  });

  it('defaults isRead to false at the database, not just in the adapter', async () => {
    // `create` never sets is_read; the column default is what makes a new
    // notification unread. A dropped default would leave it null and the
    // unread query would silently stop matching.
    const repository = new DrizzleNotificationRepository(database.db);

    const created = await repository.create({ userId: 1, message: 'x', type: 'system' });

    expect(created.isRead).toBe(false);
    expect(await repository.findUnreadByUserId(1)).toHaveLength(1);
  });

  it('markRead on a missing id is a no-op rather than an error', async () => {
    const repository = new DrizzleNotificationRepository(database.db);

    await expect(repository.markRead(9999)).resolves.toBeUndefined();
  });
});
