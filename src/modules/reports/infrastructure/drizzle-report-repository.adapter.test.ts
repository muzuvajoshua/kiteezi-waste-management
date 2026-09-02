import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { sql } from 'drizzle-orm';
import { createTestDatabase, seedUsers, type TestDatabase } from '@/test-support/pglite-database';
import { Reports } from '@/utils/db/schema';
import { DrizzleReportRepository } from './drizzle-report-repository.adapter';
import { testReportRepositoryContract } from './report-repository.contract.test-support';

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

testReportRepositoryContract('DrizzleReportRepository', () => ({
  repository: new DrizzleReportRepository(database.db),
  // The contract's Report uses the domain's camelCase names; the table uses
  // user_id / created_at / collector_id. This mapping is the inverse of the
  // adapter's own mapRow, deliberately written out rather than reused, so a
  // mistake in mapRow cannot be cancelled out by the same mistake here.
  seedReport: async (report) => {
    await database.db.insert(Reports).values({
      id: report.id,
      user_id: report.userId,
      location: report.location,
      wasteType: report.wasteType,
      amount: report.amount,
      imageUrl: report.imageUrl,
      verificationResult: report.verificationResult,
      status: report.status,
      created_at: report.createdAt,
      collector_id: report.collectorId,
    });
    await database.db.execute(
      sql`SELECT setval(pg_get_serial_sequence('reports', 'id'), (SELECT MAX(id) FROM reports))`
    );
  },
}));

describe('DrizzleReportRepository against real Postgres', () => {
  const base = {
    user_id: 1,
    location: 'Kiteezi',
    wasteType: 'general' as const,
    amount: '5',
    status: 'pending' as const,
  };

  it('maps every snake_case column onto its domain name', async () => {
    // mapRow is pure translation, and a field dropped there returns undefined
    // rather than failing — the fake, which stores domain objects directly,
    // can never catch that.
    await database.db.insert(Reports).values({
      ...base,
      id: 1,
      imageUrl: 'https://example.com/a.jpg',
      created_at: new Date('2026-03-04T05:06:07Z'),
      collector_id: 3,
    });

    const [report] = await new DrizzleReportRepository(database.db).findByUserId(1);

    expect(report).toEqual({
      id: 1,
      userId: 1,
      location: 'Kiteezi',
      wasteType: 'general',
      amount: '5',
      imageUrl: 'https://example.com/a.jpg',
      verificationResult: null,
      status: 'pending',
      createdAt: new Date('2026-03-04T05:06:07Z'),
      collectorId: 3,
    });
  });

  it('rejects a status outside the report_status enum', async () => {
    const repository = new DrizzleReportRepository(database.db);
    await database.db.insert(Reports).values({ ...base, id: 1 });

    await expect(
      repository.updateStatus(1, 'not_a_status' as unknown as 'approved')
    ).rejects.toThrow(/invalid input value for enum|not_a_status/i);
  });

  it('orders findRecent by created_at descending, not by insertion order', async () => {
    // The rows are inserted oldest-id-last on purpose: a missing ORDER BY
    // would still return them in a plausible-looking order.
    await database.db.insert(Reports).values([
      { ...base, id: 1, created_at: new Date('2026-01-02T00:00:00Z') },
      { ...base, id: 2, created_at: new Date('2026-01-03T00:00:00Z') },
      { ...base, id: 3, created_at: new Date('2026-01-01T00:00:00Z') },
    ]);

    const recent = await new DrizzleReportRepository(database.db).findRecent(3);

    expect(recent.map((r) => r.id)).toEqual([2, 1, 3]);
  });

  it('applies the limit in findRecent', async () => {
    await database.db.insert(Reports).values(
      Array.from({ length: 5 }, (_, i) => ({ ...base, id: i + 1 }))
    );

    expect(await new DrizzleReportRepository(database.db).findRecent(2)).toHaveLength(2);
  });

  it('updateStatus writes the collector only when one is supplied', async () => {
    // The adapter branches on `opts?.collectorId !== undefined`. Passing no
    // options must leave an existing collector untouched rather than nulling
    // it, which a spread-based implementation would get wrong.
    const repository = new DrizzleReportRepository(database.db);
    await database.db.insert(Reports).values({ ...base, id: 1, collector_id: 4 });

    const updated = await repository.updateStatus(1, 'approved');

    expect(updated).toMatchObject({ status: 'approved', collectorId: 4 });
  });

  it('updateStatus can claim a report for a collector', async () => {
    const repository = new DrizzleReportRepository(database.db);
    await database.db.insert(Reports).values({ ...base, id: 1 });

    const updated = await repository.updateStatus(1, 'collected', { collectorId: 6 });

    expect(updated).toMatchObject({ status: 'collected', collectorId: 6 });
  });
});
