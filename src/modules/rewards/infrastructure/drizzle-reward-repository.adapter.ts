import { eq, and, sql, desc } from 'drizzle-orm';
import type { Database } from '@/shared/infrastructure/persistence/database';
import { PointTransactions, UserRewardBalance, Users } from '@/utils/db/schema';
import type {
  RewardRepository,
  PointTransactionCursor,
  PointTransactionPage,
  RewardBalanceRow,
} from '../application/ports/reward-repository.port';

// Read side: backed by the plain http client (utils/db/dbConfig.ts), not the
// transactional Pool — none of these queries need a lock. Relocated,
// unchanged, from utils/db/internal.ts (getBalance/getPointTransactions) and
// utils/db/actions.ts (getAllRewards).
export class DrizzleRewardRepository implements RewardRepository {
  constructor(private readonly db: Database) {}

  async getBalance(userId: number): Promise<number> {
    const [row] = await this.db
      .select({ points: UserRewardBalance.points })
      .from(UserRewardBalance)
      .where(eq(UserRewardBalance.userId, userId))
      .execute();
    return row?.points ?? 0;
  }

  async getTransactions(
    userId: number,
    opts: { limit: number; cursor?: PointTransactionCursor }
  ): Promise<PointTransactionPage> {
    const { limit, cursor } = opts;
    const rows = await this.db
      .select({
        id: PointTransactions.id,
        kind: PointTransactions.kind,
        amount: PointTransactions.amount,
        relatedReportId: PointTransactions.relatedReportId,
        createdAt: PointTransactions.createdAt,
      })
      .from(PointTransactions)
      .where(
        and(
          eq(PointTransactions.userId, userId),
          cursor
            ? sql`(${PointTransactions.createdAt}, ${PointTransactions.id}) < (${cursor.createdAt}, ${cursor.id})`
            : undefined
        )
      )
      .orderBy(desc(PointTransactions.createdAt), desc(PointTransactions.id))
      .limit(limit + 1)
      .execute();

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const last = items[items.length - 1];
    const nextCursor = hasMore && last ? { createdAt: last.createdAt, id: last.id } : null;
    return { items, nextCursor };
  }

  async getAllBalances(): Promise<readonly RewardBalanceRow[]> {
    return await this.db
      .select({
        userId: UserRewardBalance.userId,
        points: UserRewardBalance.points,
        userName: Users.name,
      })
      .from(UserRewardBalance)
      .leftJoin(Users, eq(UserRewardBalance.userId, Users.id))
      .orderBy(desc(UserRewardBalance.points))
      .execute();
  }
}
