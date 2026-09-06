import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { createTestDatabase, seedUsers, type TestDatabase } from '@/test-support/pglite-database';
import { PointTransactions, UserRewardBalance, Users } from '@/utils/db/schema';
import { DrizzleRewardRepository } from './drizzle-reward-repository.adapter';
import { testRewardRepositoryContract } from './reward-repository.contract.test-support';

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

testRewardRepositoryContract('DrizzleRewardRepository', () => ({
  repository: new DrizzleRewardRepository(database.db),
  seedBalance: async (userId, points, userName) => {
    await database.db.insert(UserRewardBalance).values({ userId, points });
    // `userName` lives on `users`, not on the balance row — getAllBalances
    // reaches it through a join. seedUsers already created the row, so this
    // renames it rather than inserting.
    if (userName != null) {
      await database.db.update(Users).set({ name: userName }).where(eq(Users.id, userId));
    }
  },
  seedTransaction: async (userId, record) => {
    await database.db.insert(PointTransactions).values({
      userId,
      kind: record.kind,
      amount: record.amount,
      relatedReportId: record.relatedReportId ?? null,
      createdAt: record.createdAt,
    });
  },
}));

describe('DrizzleRewardRepository against real Postgres', () => {
  it('reads the requested user\'s balance, not simply the first row', async () => {
    // The contract only ever has one balance row in play, so dropping the
    // WHERE clause passes it — found by mutation. With several rows present,
    // an unfiltered query returns someone else's points.
    await database.db.insert(UserRewardBalance).values([
      { userId: 1, points: 10 },
      { userId: 2, points: 20 },
      { userId: 3, points: 30 },
    ]);
    const repository = new DrizzleRewardRepository(database.db);

    expect(await repository.getBalance(2)).toBe(20);
    expect(await repository.getBalance(3)).toBe(30);
    expect(await repository.getBalance(4)).toBe(0);
  });

  it('scopes a transaction page to one user', async () => {
    // Same gap as getBalance: the contract seeds a single user.
    await database.db.insert(PointTransactions).values([
      { userId: 1, kind: 'earn_report', amount: 1 },
      { userId: 2, kind: 'earn_report', amount: 2 },
    ]);

    const page = await new DrizzleRewardRepository(database.db).getTransactions(2, { limit: 10 });

    expect(page.items.map((t) => t.amount)).toEqual([2]);
  });

  it('refuses a negative balance', async () => {
    // user_reward_balance carries CHECK (points >= 0) — the invariant that
    // keeps the ledger from minting value out of nothing. The fake stores a
    // plain number and would accept -100.
    await expect(
      database.db.insert(UserRewardBalance).values({ userId: 1, points: -100 })
    ).rejects.toThrow(/check constraint|points_nonneg/i);
  });

  it('rejects a duplicate idempotency key', async () => {
    // The UNIQUE index on idempotency_key is what makes a replayed grant a
    // no-op instead of a second mint. Nothing in the fake enforces it.
    await database.db.insert(PointTransactions).values({
      userId: 1,
      kind: 'earn_collect',
      amount: 10,
      idempotencyKey: 'grant-1',
    });

    await expect(
      database.db.insert(PointTransactions).values({
        userId: 1,
        kind: 'earn_collect',
        amount: 10,
        idempotencyKey: 'grant-1',
      })
    ).rejects.toThrow(/unique|duplicate/i);
  });

  it('paginates by keyset without repeating or skipping a row', async () => {
    // The cursor is (created_at, id) as a row comparison. Every row here
    // shares one timestamp on purpose: with equal created_at values a
    // cursor that compares only the timestamp either loops forever or drops
    // rows, and the id is the tiebreaker that prevents it. The fake's
    // JavaScript sort makes this case impossible to reproduce.
    //
    // The ids are inserted out of order deliberately. With them ascending,
    // dropping `desc(id)` from the ORDER BY still produced [5,4,3,2,1] —
    // Postgres reads the (user_id, created_at) index backwards and ties come
    // out in reverse physical order, so the mutant survived. Physical order
    // 3,1,5,2,4 makes the tiebreaker the only thing that can yield 5..1.
    const sharedInstant = new Date('2026-05-05T00:00:00Z');
    await database.db.insert(PointTransactions).values(
      [3, 1, 5, 2, 4].map((id) => ({
        id,
        userId: 1,
        kind: 'earn_report' as const,
        amount: id,
        createdAt: sharedInstant,
      }))
    );
    const repository = new DrizzleRewardRepository(database.db);

    const seen: number[] = [];
    let cursor = undefined;
    for (let page = 0; page < 5; page++) {
      const result = await repository.getTransactions(1, { limit: 2, cursor });
      seen.push(...result.items.map((t) => t.id));
      if (!result.nextCursor) break;
      cursor = result.nextCursor;
    }

    expect(seen).toEqual([5, 4, 3, 2, 1]);
    expect(new Set(seen).size).toBe(5);
  });

  it('getAllBalances orders by points descending and joins the user name', async () => {
    await database.db.insert(UserRewardBalance).values([
      { userId: 1, points: 10 },
      { userId: 2, points: 90 },
      { userId: 3, points: 50 },
    ]);

    const balances = await new DrizzleRewardRepository(database.db).getAllBalances();

    expect(balances).toEqual([
      { userId: 2, points: 90, userName: 'User 2' },
      { userId: 3, points: 50, userName: 'User 3' },
      { userId: 1, points: 10, userName: 'User 1' },
    ]);
  });

  it('deletes a user\'s balance and ledger when the user goes', async () => {
    // Both foreign keys are ON DELETE CASCADE. If one were not, deleting a
    // user would either fail or strand rows that still count toward totals.
    await database.db.insert(UserRewardBalance).values({ userId: 1, points: 10 });
    await database.db.insert(PointTransactions).values({
      userId: 1,
      kind: 'earn_report',
      amount: 10,
    });

    await database.db.execute(sql`DELETE FROM users WHERE id = 1`);

    const repository = new DrizzleRewardRepository(database.db);
    expect(await repository.getBalance(1)).toBe(0);
    expect((await repository.getTransactions(1, { limit: 10 })).items).toEqual([]);
  });
});
