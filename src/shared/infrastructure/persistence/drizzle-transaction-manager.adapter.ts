import { txdb, type RewardTx } from '@/utils/db/txClient';
import type { TransactionManager } from '@/shared/application/ports/transaction-manager';

// Wraps the existing neon-serverless Pool client (utils/db/txClient.ts) —
// unchanged for now; only relocates behind the TransactionManager port so
// Phase 1 use-cases depend on the interface, not on txdb directly.
export class DrizzleTransactionManager implements TransactionManager<RewardTx> {
  run<T>(work: (tx: RewardTx) => Promise<T>): Promise<T> {
    return txdb.transaction(work);
  }
}
