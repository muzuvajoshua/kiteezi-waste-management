import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { sql } from 'drizzle-orm';
import { createTestDatabase, seedUsers, type TestDatabase } from '@/test-support/pglite-database';
import { PasswordResetTokens } from '@/utils/db/schema';
import { DrizzlePasswordResetTokenRepository } from './drizzle-password-reset-token-repository.adapter';

// KWM-063 — first coverage for this adapter.
//
// Two properties matter here and both live in the database: `used_at` is what
// makes a reset link single-use, and the raw token must never be readable
// back out. A token that stays valid after use means anyone who later reads
// the mailbox — or a forwarded copy, or a proxy log — can reset the password
// again.

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

const repo = () => new DrizzlePasswordResetTokenRepository(database.db);

describe('DrizzlePasswordResetTokenRepository', () => {
  it('round-trips a created token by its hash', async () => {
    const expiresAt = later();
    const created = await repo().create({ userId: 1, tokenHash: 'hash-1', expiresAt });

    expect(created).toEqual({ id: created.id, userId: 1, expiresAt, usedAt: null });
    expect(await repo().findByTokenHash('hash-1')).toEqual(created);
  });

  it('never returns the token hash itself', async () => {
    // The record type has no tokenHash field, and `select()` would have
    // returned one. Callers pass records around; a hash that travels with
    // them is a working reset link.
    const created = await repo().create({ userId: 1, tokenHash: 'hash-1', expiresAt: later() });

    expect(created).not.toHaveProperty('tokenHash');
    expect(await repo().findByTokenHash('hash-1')).not.toHaveProperty('tokenHash');
  });

  it('returns null for a hash that was never issued', async () => {
    expect(await repo().findByTokenHash('nope')).toBeNull();
  });

  it('returns the requested token, not simply the first row', async () => {
    await repo().create({ userId: 1, tokenHash: 'hash-1', expiresAt: later() });
    const second = await repo().create({ userId: 2, tokenHash: 'hash-2', expiresAt: later() });

    expect(await repo().findByTokenHash('hash-2')).toEqual(second);
  });

  it('refuses to issue the same token hash twice', async () => {
    await repo().create({ userId: 1, tokenHash: 'hash-1', expiresAt: later() });

    await expect(
      repo().create({ userId: 2, tokenHash: 'hash-1', expiresAt: later() })
    ).rejects.toThrow(/unique|duplicate/i);
  });

  it('markUsed stamps usedAt so a replay can be refused', async () => {
    const created = await repo().create({ userId: 1, tokenHash: 'hash-1', expiresAt: later() });

    await repo().markUsed(created.id);

    expect((await repo().findByTokenHash('hash-1'))?.usedAt).toBeInstanceOf(Date);
  });

  it('markUsed consumes only the named token', async () => {
    const first = await repo().create({ userId: 1, tokenHash: 'hash-1', expiresAt: later() });
    await repo().create({ userId: 1, tokenHash: 'hash-2', expiresAt: later() });

    await repo().markUsed(first.id);

    expect((await repo().findByTokenHash('hash-2'))?.usedAt).toBeNull();
  });

  it('invalidateAllForUser consumes every outstanding token for that user', async () => {
    // Issued on a successful reset: any other link already in a mailbox must
    // stop working.
    await repo().create({ userId: 1, tokenHash: 'a', expiresAt: later() });
    await repo().create({ userId: 1, tokenHash: 'b', expiresAt: later() });

    await repo().invalidateAllForUser(1);

    expect((await repo().findByTokenHash('a'))?.usedAt).toBeInstanceOf(Date);
    expect((await repo().findByTokenHash('b'))?.usedAt).toBeInstanceOf(Date);
  });

  it('invalidateAllForUser leaves another user\'s tokens alone', async () => {
    await repo().create({ userId: 1, tokenHash: 'a', expiresAt: later() });
    await repo().create({ userId: 2, tokenHash: 'b', expiresAt: later() });

    await repo().invalidateAllForUser(1);

    expect((await repo().findByTokenHash('b'))?.usedAt).toBeNull();
  });

  it('invalidateAllForUser keeps the original usedAt on an already-used token', async () => {
    // The IS NULL guard. Rewriting the timestamp would lose when the token
    // was actually redeemed, which is the only record of the reset.
    const created = await repo().create({ userId: 1, tokenHash: 'a', expiresAt: later() });
    await repo().markUsed(created.id);
    const consumedAt = (await repo().findByTokenHash('a'))?.usedAt;

    await new Promise((resolve) => setTimeout(resolve, 10));
    await repo().invalidateAllForUser(1);

    expect((await repo().findByTokenHash('a'))?.usedAt).toEqual(consumedAt);
  });

  it('stores an expiry the caller chose, not a default', async () => {
    const expiresAt = new Date('2026-11-12T13:14:15Z');

    const created = await repo().create({ userId: 1, tokenHash: 'a', expiresAt });

    expect(created.expiresAt).toEqual(expiresAt);
  });

  it('refuses a token for a user that does not exist', async () => {
    await expect(
      repo().create({ userId: 9999, tokenHash: 'a', expiresAt: later() })
    ).rejects.toThrow(/foreign key|violates/i);
  });

  it('drops a user\'s tokens when the user is deleted', async () => {
    await repo().create({ userId: 1, tokenHash: 'a', expiresAt: later() });

    await database.db.execute(sql`DELETE FROM users WHERE id = 1`);

    expect(await repo().findByTokenHash('a')).toBeNull();
  });

  it('stores the hash it was given, and only that', async () => {
    // Read back through the table rather than the port, since the port
    // deliberately cannot see this column.
    await repo().create({ userId: 1, tokenHash: 'hash-1', expiresAt: later() });

    const rows = await database.db
      .select({ tokenHash: PasswordResetTokens.tokenHash })
      .from(PasswordResetTokens);

    expect(rows).toEqual([{ tokenHash: 'hash-1' }]);
  });
});
