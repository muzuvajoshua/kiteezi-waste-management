import { db } from './dbConfig';
import { Users, Notifications, UserRewardBalance, PointTransactions } from './schema';
import type { NotificationType, PointKind } from './schema';
import type { RewardTx } from './txClient';
import { eq, and, sql, desc } from 'drizzle-orm';

// KWM-009/011 — internal data-layer helpers.
//
// NOT a "use server" module: anything exported from a "use server" file becomes
// a client-invokable RPC endpoint. These helpers mint points, write ledger
// rows, create users, and look up identities, so they must never be directly
// reachable from the client. They are imported only by trusted server code.
// Reads use the http client (`db`); ledger writes run inside a transaction
// handle (`tx`) supplied by the neon-serverless client (utils/db/txClient.ts).

export async function createUser(email: string, name: string) {
  try {
    const [user] = await db.insert(Users).values({ email, name }).returning().execute();
    return user;
  } catch (error) {
    console.error("Error creating user:", error);
    return null;
  }
}

export async function getUserByEmail(email: string) {
  try {
    const [user] = await db.select().from(Users).where(eq(Users.email, email)).execute();
    return user;
  } catch (error) {
    console.error("Error fetching user by email:", error);
    return null;
  }
}

export async function getUserById(id: number) {
  try {
    const [user] = await db.select().from(Users).where(eq(Users.id, id)).execute();
    return user;
  } catch (error) {
    console.error("Error fetching user by id:", error);
    return null;
  }
}

export async function createNotification(userId: number, message: string, type: NotificationType) {
  try {
    const [notification] = await db
      .insert(Notifications)
      .values({ userId, message, type })
      .returning()
      .execute();
    return notification;
  } catch (error) {
    console.error("Error creating notification:", error);
    return null;
  }
}

// --- Reward ledger (KWM-011/012/018) ---------------------------------------

/**
 * Appends a signed point transaction and updates the materialised balance in
 * lockstep, inside the caller's transaction `tx`. Idempotent when an
 * `idempotencyKey` is supplied: a duplicate key inserts nothing and the balance
 * is left untouched (returns false). With a null key no dedup is performed
 * (returns true and applies). Preserves the invariant
 *   SUM(point_transactions.amount) == user_reward_balance.points.
 */
export async function recordPointTransaction(
  tx: RewardTx,
  params: {
    userId: number;
    kind: PointKind;
    amount: number;
    relatedReportId?: number | null;
    relatedRedemptionId?: number | null;
    idempotencyKey?: string | null;
  }
): Promise<boolean> {
  const {
    userId,
    kind,
    amount,
    relatedReportId = null,
    relatedRedemptionId = null,
    idempotencyKey = null,
  } = params;

  const inserted = await tx
    .insert(PointTransactions)
    .values({ userId, kind, amount, relatedReportId, relatedRedemptionId, idempotencyKey })
    .onConflictDoNothing({ target: PointTransactions.idempotencyKey })
    .returning({ id: PointTransactions.id });

  if (inserted.length === 0) return false; // duplicate idempotency key — already applied

  await tx
    .insert(UserRewardBalance)
    .values({ userId, points: amount })
    .onConflictDoUpdate({
      target: UserRewardBalance.userId,
      set: { points: sql`${UserRewardBalance.points} + ${amount}`, updatedAt: new Date() },
    });

  return true;
}

/** Reads the materialised balance (0 when no row). Single source of truth (KWM-012). */
export async function getBalance(userId: number): Promise<number> {
  const [row] = await db
    .select({ points: UserRewardBalance.points })
    .from(UserRewardBalance)
    .where(eq(UserRewardBalance.userId, userId))
    .execute();
  return row?.points ?? 0;
}

export interface PointTxnCursor {
  createdAt: Date;
  id: number;
}

/** Paginated activity list (keyset on (created_at,id) DESC). NOT a balance source. */
export async function getPointTransactions(
  userId: number,
  opts: { limit: number; cursor?: PointTxnCursor }
) {
  const { limit, cursor } = opts;
  const rows = await db
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
