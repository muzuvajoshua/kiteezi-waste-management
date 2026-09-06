import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from 'vitest';
import { desc } from 'drizzle-orm';
import { createTestDatabase, seedUsers, type TestDatabase } from '@/test-support/pglite-database';
import { AuditLog } from '@/utils/db/schema';
import { DrizzleAuditLogger } from './drizzle-audit-logger.adapter';

// KWM-063 — first coverage for this adapter.
//
// KWM-078 wired audit calls into the actions and tested that wiring against
// an in-memory logger. This is the other half: that the real writer actually
// puts a row in `audit_log`. The table shipped in June and sat empty for
// months precisely because nothing verified the write end.

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

const logger = () => new DrizzleAuditLogger(database.db);
const entries = () => database.db.select().from(AuditLog).orderBy(desc(AuditLog.id));

describe('DrizzleAuditLogger', () => {
  it('writes the entry it was given', async () => {
    await logger().record({
      actorUserId: 7,
      action: 'reward.points.granted',
      target: 'user:2',
      before: { balance: 0 },
      after: { balance: 50 },
    });

    expect(await entries()).toMatchObject([
      {
        actorUserId: 7,
        action: 'reward.points.granted',
        target: 'user:2',
        before: { balance: 0 },
        after: { balance: 50 },
      },
    ]);
  });

  it('stores before and after as jsonb, not as strings', async () => {
    // Read back as objects. A driver that stringified them would make the
    // log unqueryable by field, which is most of its value.
    await logger().record({
      actorUserId: 1,
      action: 'report.status.updated',
      target: 'report:9',
      after: { status: 'approved', nested: { deep: [1, 2] } },
    });

    const [row] = await entries();
    expect(row.after).toEqual({ status: 'approved', nested: { deep: [1, 2] } });
  });

  it('defaults before and after to null when omitted', async () => {
    await logger().record({ actorUserId: 1, action: 'x', target: 'y' });

    const [row] = await entries();
    expect(row.before).toBeNull();
    expect(row.after).toBeNull();
  });

  it('accepts a null actor for a system action', async () => {
    // actor_user_id is nullable on purpose, so unauthenticated and scheduled
    // work can still be recorded.
    await logger().record({ actorUserId: null, action: 'system.cleanup', target: 'sessions' });

    expect(await entries()).toMatchObject([{ actorUserId: null }]);
  });

  it('appends rather than replacing', async () => {
    await logger().record({ actorUserId: 1, action: 'first', target: 't' });
    await logger().record({ actorUserId: 1, action: 'second', target: 't' });

    expect((await entries()).map((r) => r.action)).toEqual(['second', 'first']);
  });

  it('stamps createdAt from the database', async () => {
    await logger().record({ actorUserId: 1, action: 'x', target: 'y' });

    const [row] = await entries();
    expect(row.createdAt).toBeInstanceOf(Date);
  });

  describe('when the write fails', () => {
    it('does not throw, so the audited action still succeeds', async () => {
      // Fail-open, deliberately: a status change should not be refused
      // because the audit table is unavailable. A foreign key to a
      // non-existent actor is the cheapest genuine failure to provoke.
      vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(
        logger().record({ actorUserId: 9999, action: 'x', target: 'y' })
      ).resolves.toBeUndefined();
    });

    it('is reported to the server console rather than swallowed', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await logger().record({ actorUserId: 9999, action: 'x', target: 'y' });

      expect(spy).toHaveBeenCalledWith('Failed to write audit entry:', expect.anything());
    });

    it('writes nothing when it fails', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});

      await logger().record({ actorUserId: 9999, action: 'x', target: 'y' });

      expect(await entries()).toEqual([]);
    });
  });
});
