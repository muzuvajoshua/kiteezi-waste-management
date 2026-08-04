import type {
  RewardRepository,
  PointTransactionRecord,
  PointTransactionCursor,
  PointTransactionPage,
  RewardBalanceRow,
} from '../application/ports/reward-repository.port';

interface StoredTransaction extends PointTransactionRecord {
  readonly userId: number;
}

// In-memory fake for RewardRepository's read side. Not a mock: real
// filtering/pagination/sort logic over plain seeded state, so application
// tests exercise real orchestration rather than a scripted stub.
export class InMemoryRewardRepository implements RewardRepository {
  private readonly balances = new Map<number, number>();
  private readonly userNames = new Map<number, string | null>();
  private readonly transactions: StoredTransaction[] = [];
  private nextId = 1;

  seedBalance(userId: number, points: number, userName: string | null = null): void {
    this.balances.set(userId, points);
    this.userNames.set(userId, userName);
  }

  seedTransaction(userId: number, record: Omit<PointTransactionRecord, 'id'> & { id?: number }): void {
    const id = record.id ?? this.nextId++;
    this.transactions.push({ ...record, id, userId });
  }

  async getBalance(userId: number): Promise<number> {
    return this.balances.get(userId) ?? 0;
  }

  async getTransactions(
    userId: number,
    opts: { limit: number; cursor?: PointTransactionCursor }
  ): Promise<PointTransactionPage> {
    const { limit, cursor } = opts;
    const sorted = this.transactions
      .filter((t) => t.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id - a.id)
      .filter((t) => !cursor || isBeforeCursor(t, cursor));

    const page = sorted.slice(0, limit + 1);
    const hasMore = page.length > limit;
    const items = hasMore ? page.slice(0, limit) : page;
    const last = items[items.length - 1];
    const nextCursor = hasMore && last ? { createdAt: last.createdAt, id: last.id } : null;

    return {
      items: items.map(({ id, kind, amount, relatedReportId, createdAt }) => ({
        id,
        kind,
        amount,
        relatedReportId,
        createdAt,
      })),
      nextCursor,
    };
  }

  async getAllBalances(): Promise<readonly RewardBalanceRow[]> {
    return [...this.balances.entries()]
      .map(([userId, points]) => ({ userId, points, userName: this.userNames.get(userId) ?? null }))
      .sort((a, b) => b.points - a.points);
  }
}

function isBeforeCursor(t: StoredTransaction, cursor: PointTransactionCursor): boolean {
  const tTime = t.createdAt.getTime();
  const cTime = cursor.createdAt.getTime();
  return tTime < cTime || (tTime === cTime && t.id < cursor.id);
}
