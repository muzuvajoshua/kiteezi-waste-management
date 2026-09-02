import { testRewardRepositoryContract } from './reward-repository.contract.test-support';
import { InMemoryRewardRepository } from './in-memory-reward-repository.adapter';

// The in-memory run of the shared contract. Previously the tail of
// reward-repository.contract.test.ts; split out by KWM-063 so the contract can be
// imported without also executing this run.
testRewardRepositoryContract('InMemoryRewardRepository', () => {
  const repository = new InMemoryRewardRepository();
  return {
    repository,
    seedBalance: async (userId, points, userName = null) => repository.seedBalance(userId, points, userName),
    seedTransaction: async (userId, record) =>
      repository.seedTransaction(userId, { ...record, relatedReportId: record.relatedReportId ?? null }),
  };
});
