import { testCollectedWasteRepositoryContract } from './collected-waste-repository.contract.test-support';
import { InMemoryCollectedWasteRepository } from './in-memory-collected-waste-repository.adapter';

// The in-memory run of the shared contract. Previously the tail of
// collected-waste-repository.contract.test.ts; split out by KWM-063 so the
// contract can be imported without also executing this run.
testCollectedWasteRepositoryContract('InMemoryCollectedWasteRepository', () => ({
  repository: new InMemoryCollectedWasteRepository(),
}));
