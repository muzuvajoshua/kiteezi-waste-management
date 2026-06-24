import { db } from './dbConfig';
import { Users, Rewards, Notifications, Transactions } from './schema';
import type { NotificationType } from './schema';
import { eq, sql } from 'drizzle-orm';

// KWM-009 — internal data-layer helpers.
//
// This is deliberately NOT a "use server" module. Anything exported from a
// "use server" file becomes a client-invokable RPC endpoint; these functions
// mint points, write ledger rows, create users, and look up identities, so they
// must never be directly reachable from the client. They are imported only by
// trusted server code: the auth routes, the RBAC resolver, and the guarded
// actions in actions.ts. Keeping them off the action surface is part of closing
// audit blocker C-4.

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

export async function getOrCreateReward(userId: number) {
  try {
    let [reward] = await db.select().from(Rewards).where(eq(Rewards.user_id, userId)).execute();
    if (!reward) {
      [reward] = await db.insert(Rewards).values({
        user_id: userId,
        name: 'Default Reward',
        collectionInfor: 'Default Collection Info',
        points: 0,
        isAvailable: true,
      }).returning().execute();
    }
    return reward;
  } catch (error) {
    console.error("Error getting or creating reward:", error);
    return null;
  }
}

export async function updateRewardPoints(userId: number, pointsToAdd: number) {
  try {
    const [updatedReward] = await db
      .update(Rewards)
      .set({
        points: sql`${Rewards.points} + ${pointsToAdd}`,
        updatedAt: new Date()
      })
      .where(eq(Rewards.user_id, userId))
      .returning()
      .execute();
    return updatedReward;
  } catch (error) {
    console.error("Error updating reward points:", error);
    return null;
  }
}

export async function createTransaction(userId: number, type: 'earned_report' | 'earned_collect' | 'redeemed', amount: number, description: string) {
  try {
    const [transaction] = await db
      .insert(Transactions)
      .values({ userId, type, amount, description })
      .returning()
      .execute();
    return transaction;
  } catch (error) {
    console.error("Error creating transaction:", error);
    throw error;
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
