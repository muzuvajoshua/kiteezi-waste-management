import type { TransactionManager } from '@/shared/application/ports/transaction-manager';
import type { RewardLedgerUnitOfWork } from '@/modules/rewards/application/ports/reward-ledger-unit-of-work.port';
import { InMemoryRewardTransactionManager } from '@/modules/rewards/infrastructure/in-memory-reward-ledger-unit-of-work.adapter';
import type { ReportWriteUnitOfWork, CreateReportInput } from '../application/ports/report-write-unit-of-work.port';
import type { Report } from '../domain/report';

class InMemoryReportWriteStore {
  readonly reports = new Map<number, Report>();
  nextId = 1;
}

class InMemoryReportWriteUnitOfWork implements ReportWriteUnitOfWork {
  constructor(
    private readonly store: InMemoryReportWriteStore,
    readonly rewardLedgerTxManager: TransactionManager<RewardLedgerUnitOfWork>
  ) {}

  async insert(input: CreateReportInput): Promise<Report> {
    const report: Report = {
      id: this.store.nextId++,
      userId: input.userId,
      location: input.location,
      wasteType: input.wasteType,
      amount: input.amount,
      imageUrl: input.imageUrl ?? null,
      verificationResult: null,
      status: 'pending',
      createdAt: new Date(),
      collectorId: null,
      reviewReason: null,
    };
    this.store.reports.set(report.id, report);
    return report;
  }
}

// Test-only cross-module reuse: the rewards module's own in-memory
// TransactionManager<RewardLedgerUnitOfWork> fake plugs directly into this
// fake's rewardLedgerTxManager slot, mirroring how the Drizzle adapter
// plugs wrapExistingTx(tx) into the same slot with a real transaction.
export class InMemoryReportTransactionManager implements TransactionManager<ReportWriteUnitOfWork> {
  private readonly store = new InMemoryReportWriteStore();
  readonly rewardTransactionManager = new InMemoryRewardTransactionManager();

  get reports(): ReadonlyMap<number, Report> {
    return this.store.reports;
  }

  async run<T>(work: (uow: ReportWriteUnitOfWork) => Promise<T>): Promise<T> {
    return work(new InMemoryReportWriteUnitOfWork(this.store, this.rewardTransactionManager));
  }
}
