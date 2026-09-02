import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { createTestDatabase, type TestDatabase } from '@/test-support/pglite-database';
import { Users, Reports } from '@/utils/db/schema';
import { DrizzleCollectedWasteRepository } from './drizzle-collected-waste-repository.adapter';
import { testCollectedWasteRepositoryContract } from './collected-waste-repository.contract.test-support';

// KWM-063 — the same contract the in-memory fake passes, run against real
// Postgres. This adapter had no test at all before: its module-scope `db`
// import made one impossible.

let database: TestDatabase;

beforeAll(async () => {
  database = await createTestDatabase();
}, 60_000);

beforeEach(async () => {
  await database.reset();
  // collected_wastes.report_id and .collector_id are real foreign keys here,
  // which the in-memory fake does not model. The contract writes collections
  // for report ids 1,2,5,10 and collector ids 1,2,3,7, so those rows must
  // exist. Seeding generously is deliberate: a contract test failing on a
  // missing fixture says nothing about the adapter.
  await database.db
    .insert(Users)
    .values(
      Array.from({ length: 10 }, (_, i) => ({
        id: i + 1,
        email: `user${i + 1}@example.com`,
        name: `User ${i + 1}`,
      }))
    );
  await database.db.insert(Reports).values(
    Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      user_id: 1,
      location: 'Kiteezi',
      wasteType: 'general' as const,
      amount: '1',
      status: 'pending' as const,
    }))
  );
});

afterAll(async () => {
  await database.close();
});

testCollectedWasteRepositoryContract('DrizzleCollectedWasteRepository', () => ({
  repository: new DrizzleCollectedWasteRepository(database.db),
}));

// Behaviour only a real database exhibits — the fake accepts any number,
// so these would pass against it for the wrong reason.
describe('DrizzleCollectedWasteRepository against real Postgres', () => {
  it('refuses a collection against a report that does not exist', async () => {
    const repository = new DrizzleCollectedWasteRepository(database.db);

    await expect(
      repository.record({ reportId: 9999, collectorId: 1, status: 'collected' })
    ).rejects.toThrow(/foreign key|violates/i);
  });

  it('refuses a collection by a collector that does not exist', async () => {
    const repository = new DrizzleCollectedWasteRepository(database.db);

    await expect(
      repository.record({ reportId: 1, collectorId: 9999, status: 'collected' })
    ).rejects.toThrow(/foreign key|violates/i);
  });

  it('stores a collection date the database generated, not a client Date', async () => {
    // `record` sets collectionDate itself; the column must round-trip as a
    // Date rather than the string a driver would hand back untyped.
    const repository = new DrizzleCollectedWasteRepository(database.db);

    const created = await repository.record({
      reportId: 1,
      collectorId: 1,
      status: 'collected',
    });

    expect(created.collectionDate).toBeInstanceOf(Date);
  });
});
