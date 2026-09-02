import { testNotificationRepositoryContract } from './notification-repository.contract.test-support';
import { InMemoryNotificationRepository } from './in-memory-notification-repository.adapter';

// The in-memory run of the shared contract. Previously the tail of
// notification-repository.contract.test.ts; split out by KWM-063 so the contract can be
// imported without also executing this run.
testNotificationRepositoryContract('InMemoryNotificationRepository', () => ({
  repository: new InMemoryNotificationRepository(),
}));
