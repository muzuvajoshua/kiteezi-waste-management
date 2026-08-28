import { describe, it, expect } from 'vitest';
import type { CollectedWasteRepository } from '../application/ports/collected-waste-repository.port';
import { InMemoryCollectedWasteRepository } from './in-memory-collected-waste-repository.adapter';

export interface CollectedWasteRepositoryContractHarness {
  readonly repository: CollectedWasteRepository;
}

// Shared behavioral contract for any CollectedWasteRepository
// implementation. Run here against the in-memory fake; re-run against
// DrizzleCollectedWasteRepository once a live/staging Postgres is
// available in CI (KWM-063) — intentionally NOT wired up yet, matching the
// rewards/auth/notifications/reports modules' contract tests (no live DB
// in this environment).
export function testCollectedWasteRepositoryContract(
  name: string,
  createHarness: () => CollectedWasteRepositoryContractHarness
): void {
  describe(`CollectedWasteRepository contract: ${name}`, () => {
    it('record then findByCollectorId round-trips the collection', async () => {
      const { repository } = createHarness();
      const created = await repository.record({ reportId: 10, collectorId: 7, status: 'collected' });
      expect(created).toMatchObject({ reportId: 10, collectorId: 7, status: 'collected' });

      const found = await repository.findByCollectorId(7);
      expect(found.map((c) => c.id)).toEqual([created.id]);
    });

    it('findByCollectorId only returns that collector\'s records', async () => {
      const { repository } = createHarness();
      await repository.record({ reportId: 1, collectorId: 1, status: 'collected' });
      await repository.record({ reportId: 2, collectorId: 2, status: 'collected' });

      const found = await repository.findByCollectorId(1);
      expect(found).toHaveLength(1);
      expect(found[0].collectorId).toBe(1);
    });

    it('record can create a verified collection directly', async () => {
      const { repository } = createHarness();
      const created = await repository.record({ reportId: 5, collectorId: 3, status: 'verified' });
      expect(created.status).toBe('verified');
    });
  });
}

testCollectedWasteRepositoryContract('InMemoryCollectedWasteRepository', () => ({
  repository: new InMemoryCollectedWasteRepository(),
}));
