import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { sql } from 'drizzle-orm';
import { createTestDatabase, seedUsers, type TestDatabase } from '@/test-support/pglite-database';
import { DrizzleSessionRepository } from './drizzle-session-repository.adapter';

// KWM-063 — first coverage for this adapter.
//
// The session cookie is a stateless JWT, so this table is the only thing that
// can end a session before its expiry. Every assertion here is about that:
// a revocation that silently does not happen leaves a captured cookie valid.

let database: TestDatabase;
const later = () => new Date(Date.now() + 60 * 60 * 1000);

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

const repo = () => new DrizzleSessionRepository(database.db);

describe('DrizzleSessionRepository', () => {
  it('round-trips a created session', async () => {
    const expiresAt = later();
    await repo().create({ sessionId: 'sid-1', userId: 1, expiresAt });

    expect(await repo().findById('sid-1')).toEqual({
      sessionId: 'sid-1',
      userId: 1,
      expiresAt,
      revokedAt: null,
    });
  });

  it('returns null for a session id that was never issued', async () => {
    expect(await repo().findById('never-issued')).toBeNull();
  });

  it('returns the requested session, not simply the first row', async () => {
    await repo().create({ sessionId: 'sid-1', userId: 1, expiresAt: later() });
    await repo().create({ sessionId: 'sid-2', userId: 2, expiresAt: later() });

    expect((await repo().findById('sid-2'))?.userId).toBe(2);
  });

  it('revoke stamps revokedAt so the session stops being usable', async () => {
    await repo().create({ sessionId: 'sid-1', userId: 1, expiresAt: later() });

    await repo().revoke('sid-1');

    expect((await repo().findById('sid-1'))?.revokedAt).toBeInstanceOf(Date);
  });

  it('revoke leaves other sessions alone', async () => {
    // A logout that ends every session in the table would be a denial of
    // service on every other signed-in user.
    await repo().create({ sessionId: 'sid-1', userId: 1, expiresAt: later() });
    await repo().create({ sessionId: 'sid-2', userId: 2, expiresAt: later() });

    await repo().revoke('sid-1');

    expect((await repo().findById('sid-2'))?.revokedAt).toBeNull();
  });

  it('a repeated logout keeps the original revocation time', async () => {
    // The WHERE clause carries `IS NULL` for exactly this. Rewriting the
    // timestamp would lose when the session actually ended, which is the
    // question the row exists to answer.
    await repo().create({ sessionId: 'sid-1', userId: 1, expiresAt: later() });
    await repo().revoke('sid-1');
    const first = (await repo().findById('sid-1'))?.revokedAt;

    await new Promise((resolve) => setTimeout(resolve, 10));
    await repo().revoke('sid-1');

    expect((await repo().findById('sid-1'))?.revokedAt).toEqual(first);
  });

  it('revokeAllForUser ends every live session for that user and counts them', async () => {
    await repo().create({ sessionId: 'a', userId: 1, expiresAt: later() });
    await repo().create({ sessionId: 'b', userId: 1, expiresAt: later() });
    await repo().create({ sessionId: 'c', userId: 2, expiresAt: later() });

    expect(await repo().revokeAllForUser(1)).toBe(2);
    expect((await repo().findById('a'))?.revokedAt).toBeInstanceOf(Date);
    expect((await repo().findById('b'))?.revokedAt).toBeInstanceOf(Date);
    expect((await repo().findById('c'))?.revokedAt).toBeNull();
  });

  it('revokeAllForUser does not re-count sessions already revoked', async () => {
    // The count is reported back to the user ("signed out of N devices"), so
    // counting an already-dead session overstates what happened.
    await repo().create({ sessionId: 'a', userId: 1, expiresAt: later() });
    await repo().create({ sessionId: 'b', userId: 1, expiresAt: later() });
    await repo().revoke('a');

    expect(await repo().revokeAllForUser(1)).toBe(1);
  });

  it('revokeAllForUser reports zero when the user has no live session', async () => {
    expect(await repo().revokeAllForUser(1)).toBe(0);
  });

  it('refuses a session for a user that does not exist', async () => {
    await expect(
      repo().create({ sessionId: 'sid-1', userId: 9999, expiresAt: later() })
    ).rejects.toThrow(/foreign key|violates/i);
  });

  it('refuses to reissue a session id already in use', async () => {
    // session_id is the JWT's jti and the primary key. A collision that
    // silently overwrote would rebind a live session to another user.
    await repo().create({ sessionId: 'sid-1', userId: 1, expiresAt: later() });

    await expect(
      repo().create({ sessionId: 'sid-1', userId: 2, expiresAt: later() })
    ).rejects.toThrow(/unique|duplicate/i);
  });

  it('drops a user\'s sessions when the user is deleted', async () => {
    // ON DELETE CASCADE. Without it, deleting a user would either fail on the
    // constraint or strand session rows pointing at nobody.
    await repo().create({ sessionId: 'sid-1', userId: 1, expiresAt: later() });

    await database.db.execute(sql`DELETE FROM users WHERE id = 1`);

    expect(await repo().findById('sid-1')).toBeNull();
  });
});
