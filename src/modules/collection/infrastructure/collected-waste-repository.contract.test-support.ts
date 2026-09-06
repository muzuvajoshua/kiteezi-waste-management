import { describe, it, expect } from 'vitest';
import type { CollectedWasteRepository } from '../application/ports/collected-waste-repository.port';

export interface CollectedWasteRepositoryContractHarness {
  readonly repository: CollectedWasteRepository;
}

// Shared behavioral contract for any CollectedWasteRepository
// implementation. Two files invoke it: in-memory-…adapter.test.ts with the
// fake, and drizzle-…adapter.test.ts against a real Postgres (KWM-063). Both
// run these same assertions, which is what stops the fake drifting from the
// implementation it stands in for.
//
// KWM-063 also made this a `.test-support.ts` module. It used to be a
// `.contract.test.ts` that both defined the contract AND ran it against the
// fake at import time, so the Drizzle file importing the function re-ran the
// whole in-memory suite inside itself — every case reported twice, and the
// Drizzle file's own fixtures applied to a run that had nothing to do with
// them. Definition here, invocation in the two adapter test files.
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
