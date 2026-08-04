import type { PointTransaction } from '../domain/point-transaction';
import type { RewardLedgerUnitOfWork } from '../application/ports/reward-ledger-unit-of-work.port';
import type { TransactionManager } from '@/shared/application/ports/transaction-manager';

// Shared mutable state behind the fake transaction manager below. There is no
// real isolation between concurrent "transactions" here — good enough for
// exercising use-case orchestration in tests, not a substitute for the
// Drizzle adapter's real SELECT ... FOR UPDATE locking.
class InMemoryRewardLedgerStore {
  readonly balances = new Map<number, number>();
  readonly appliedIdempotencyKeys = new Set<string>();
  readonly transactions: PointTransaction[] = [];
}

class InMemoryRewardLedgerUnitOfWork implements RewardLedgerUnitOfWork {
  constructor(private readonly store: InMemoryRewardLedgerStore) {}

  async getBalanceForUpdate(userId: number): Promise<number> {
    return this.store.balances.get(userId) ?? 0;
  }

  async appendTransaction(entry: PointTransaction): Promise<boolean> {
    if (entry.idempotencyKey && this.store.appliedIdempotencyKeys.has(entry.idempotencyKey)) {
      return false;
    }
    if (entry.idempotencyKey) {
      this.store.appliedIdempotencyKeys.add(entry.idempotencyKey);
    }
    this.store.transactions.push(entry);
    const current = this.store.balances.get(entry.userId) ?? 0;
    this.store.balances.set(entry.userId, current + entry.amount);
    return true;
  }
}

// The fake TransactionManager<RewardLedgerUnitOfWork> application tests
// construct directly: seed a starting balance, pass this as the `txManager`
// port param, then inspect `.balances`/`.transactions` afterwards.
export class InMemoryRewardTransactionManager implements TransactionManager<RewardLedgerUnitOfWork> {
  private readonly store = new InMemoryRewardLedgerStore();

  get balances(): ReadonlyMap<number, number> {
    return this.store.balances;
  }

  get transactions(): readonly PointTransaction[] {
    return this.store.transactions;
  }

  seedBalance(userId: number, points: number): void {
    this.store.balances.set(userId, points);
  }

  async run<T>(work: (uow: RewardLedgerUnitOfWork) => Promise<T>): Promise<T> {
    return work(new InMemoryRewardLedgerUnitOfWork(this.store));
  }
}
