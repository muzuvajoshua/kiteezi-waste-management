import type { TransactionManager } from '@/shared/application/ports/transaction-manager';
import type { RewardLedgerUnitOfWork } from '@/modules/rewards/application/ports/reward-ledger-unit-of-work.port';
import type { Report, WasteType } from '../../domain/report';

export interface CreateReportInput {
  readonly userId: number;
  readonly location: string;
  readonly wasteType: WasteType;
  readonly amount: string;
  readonly imageUrl?: string | null;
}

// Write side for createReport specifically: the report insert and the
// rewards points mint must commit/roll back together (today's reason for
// checking and re-throwing on the mint's Result, not swallowing it — see
// create-report.usecase.ts). `rewardLedgerTxManager` is bound to the SAME
// open transaction as insert() — a cross-module port reference (this is
// the first place one module's Application layer depends on another
// module's Application layer, not just Presentation-to-Presentation like
// the already-established reward.actions.ts -> auth-guards.ts pattern).
export interface ReportWriteUnitOfWork {
  insert(input: CreateReportInput): Promise<Report>;
  readonly rewardLedgerTxManager: TransactionManager<RewardLedgerUnitOfWork>;
}
