import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { createTestDatabase, type TestDatabase } from '@/test-support/pglite-database';
import { RewardCatalog } from '@/utils/db/schema';
import { DrizzleRewardCatalogRepository } from './drizzle-reward-catalog-repository.adapter';

// KWM-063 — first coverage for this adapter.

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

const repo = () => new DrizzleRewardCatalogRepository(database.db);

const item = (over: Partial<typeof RewardCatalog.$inferInsert> = {}) => ({
  name: 'Airtime',
  description: 'Mobile airtime',
  costPoints: 100,
  isAvailable: true,
  ...over,
});

describe('DrizzleRewardCatalogRepository', () => {
  describe('findAvailable', () => {
    it('returns nothing when the catalog is empty', async () => {
      expect(await repo().findAvailable()).toEqual([]);
    });

    it('returns available items as domain objects', async () => {
      await database.db.insert(RewardCatalog).values(item({ id: 1 }));

      const [found] = await repo().findAvailable();

      expect(found).toMatchObject({ id: 1, name: 'Airtime', costPoints: 100 });
    });

    it('omits items withdrawn from the catalog', async () => {
      // isAvailable is how an item is retired. Returning one anyway would let
      // a user spend points on something that cannot be fulfilled.
      await database.db.insert(RewardCatalog).values([
        item({ id: 1, name: 'Live' }),
        item({ id: 2, name: 'Retired', isAvailable: false }),
      ]);

      expect((await repo().findAvailable()).map((r) => r.name)).toEqual(['Live']);
    });
  });

  describe('findById', () => {
    it('returns null for an id that is not in the catalog', async () => {
      expect(await repo().findById(999)).toBeNull();
    });

    it('returns the requested item, not simply the first row', async () => {
      await database.db.insert(RewardCatalog).values([
        item({ id: 1, name: 'First' }),
        item({ id: 2, name: 'Second' }),
      ]);

      expect(await repo().findById(2)).toMatchObject({ id: 2, name: 'Second' });
    });

    it('still returns a withdrawn item', async () => {
      // Deliberately not filtered: redeem-by-id needs to tell "no such
      // reward" from "that reward is no longer offered", and the second is
      // the use-case's decision to make, not this adapter's.
      await database.db.insert(RewardCatalog).values(item({ id: 1, isAvailable: false }));

      expect(await repo().findById(1)).toMatchObject({ id: 1, isAvailable: false });
    });
  });

  it('refuses a negative cost', async () => {
    // CHECK (cost_points >= 0). A negative cost would pay a user to redeem.
    await expect(
      database.db.insert(RewardCatalog).values(item({ costPoints: -1 }))
    ).rejects.toThrow(/check constraint|cost_points_nonneg/i);
  });

  it('allows a free reward', async () => {
    // The boundary the CHECK permits, asserted so a later tightening to > 0
    // is a deliberate decision rather than an accident.
    await expect(
      database.db.insert(RewardCatalog).values(item({ id: 1, costPoints: 0 }))
    ).resolves.toBeDefined();
  });
});
