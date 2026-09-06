import { testReportRepositoryContract } from './report-repository.contract.test-support';
import { InMemoryReportRepository } from './in-memory-report-repository.adapter';

// The in-memory run of the shared contract. Previously the tail of
// report-repository.contract.test.ts; split out by KWM-063 so the contract can be
// imported without also executing this run.
testReportRepositoryContract('InMemoryReportRepository', () => {
  const repository = new InMemoryReportRepository();
  return {
    repository,
    seedReport: async (report) => repository.seed(report),
  };
});
