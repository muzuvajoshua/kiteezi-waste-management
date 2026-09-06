import { testUserRepositoryContract } from './user-repository.contract.test-support';
import { InMemoryUserRepository } from './in-memory-user-repository.adapter';

// The in-memory run of the shared contract. Previously the tail of
// user-repository.contract.test.ts; split out by KWM-063 so the contract can be
// imported without also executing this run.
testUserRepositoryContract('InMemoryUserRepository', () => {
  const repository = new InMemoryUserRepository();
  return {
    repository,
    seedUser: async (id, email, name) => repository.seed({ id, email, name }),
  };
});
