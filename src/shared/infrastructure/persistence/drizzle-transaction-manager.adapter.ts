import type { Database, DatabaseTx } from './database';
import type { TransactionManager } from '@/shared/application/ports/transaction-manager';

// Relocates transaction handling behind the TransactionManager port so
// use-cases depend on the interface, not on a concrete client.
//
// KWM-063 replaced the module-scope `txdb` import with an injected client.
// The composition root still passes the neon-serverless Pool — neon-http
// cannot run interactive transactions — but the class no longer names it, so
// a test can supply a PGlite client that does real BEGIN/COMMIT/ROLLBACK.
export class DrizzleTransactionManager implements TransactionManager<DatabaseTx> {
  constructor(private readonly db: Database) {}

  run<T>(work: (tx: DatabaseTx) => Promise<T>): Promise<T> {
    return this.db.transaction(work);
  }
}
