import type { Database, DatabaseTx } from '@/shared/infrastructure/persistence/database';
import { Reports } from '@/utils/db/schema';
import { wrapExistingTx } from '@/modules/rewards/infrastructure/drizzle-reward-ledger-unit-of-work.adapter';
import type { TransactionManager } from '@/shared/application/ports/transaction-manager';
import type { ReportWriteUnitOfWork, CreateReportInput } from '../application/ports/report-write-unit-of-work.port';
import type { Report } from '../domain/report';

// The one deliberate Infrastructure-to-Infrastructure cross-module import
// in this module: wrapExistingTx (from the rewards module) adapts the SAME
// raw `tx` this class already has open into a
// TransactionManager<RewardLedgerUnitOfWork>, so createReport's points
// mint commits/rolls back atomically with the report insert — exactly like
// today's single txdb.transaction. Narrowly scoped: wrapExistingTx only
// ever touches PointTransactions/UserRewardBalance, tables this module
// doesn't own. Same documented-exception category as the rewards module's
// own cross-module read-join (RewardBalanceRow).
class DrizzleReportWriteUnitOfWork implements ReportWriteUnitOfWork {
  constructor(private readonly tx: DatabaseTx) {}

  get rewardLedgerTxManager() {
    return wrapExistingTx(this.tx);
  }

  async insert(input: CreateReportInput): Promise<Report> {
    const [created] = await this.tx
      .insert(Reports)
      .values({
        user_id: input.userId,
        location: input.location,
        wasteType: input.wasteType,
        amount: input.amount,
        imageUrl: input.imageUrl ?? null,
        // Set server-side (pending) — the AI verdict is never client-trusted (KWM-043).
        verificationResult: null,
        status: 'pending',
      })
      .returning();

    return {
      id: created.id,
      userId: created.user_id,
      location: created.location,
      wasteType: created.wasteType,
      amount: created.amount,
      imageUrl: created.imageUrl,
      verificationResult: created.verificationResult,
      status: created.status,
      createdAt: created.created_at,
      collectorId: created.collector_id,
    };
  }
}

export class DrizzleReportTransactionManager implements TransactionManager<ReportWriteUnitOfWork> {
  constructor(private readonly db: Database) {}

  run<T>(work: (uow: ReportWriteUnitOfWork) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => work(new DrizzleReportWriteUnitOfWork(tx)));
  }
}
