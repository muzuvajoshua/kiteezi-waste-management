import { date } from "drizzle-orm/mysql-core";
import {db} from "./dbConfig";
import { Users, Notifications, Transactions } from "./schema";

import {eq,sql,desc,and} from 'drizzle-orm';

export async function createUser(email:string, name:string){
    try {
        const [user] = await db.insert(Users).values({
            email,name
        }).returning().execute();
        return user;
        
    } catch (error) {
        console.error("Error creating User", error)
        return null;

        
    }
}

export async function getUserByEmail(email:string){
    try {
        const [user] = await db.select().from(Users).where(eq(Users.email,email)).execute();
        return user;
    } catch (error) {
        console.error("Error fetching User by email", error);
        return null;
        
    }
}

export async function getUnreadNotifications(userId:number){
    try {
        return await db.select().from(Notifications).where(and(eq(Notifications.userId,userId),
            eq(Notifications.isRead,false))
        ).execute();and
       
    } catch (error) {
        console.error("Error fetching notifications", error);
        return [];
    }
}

export async function getRewardTransactions(userId:number){
    try {
        const transactions = await db.select(
           { id:Transactions.id,
            type:Transactions.type,
            amount:Transactions.amount,
            description:Transactions.description,
            date:Transactions.date,
        
        }
        ).from(Transactions).where(eq(Transactions.userId,userId)).orderBy(desc(Transactions.date)).limit(10).execute();

        const formattedTransactions = transactions.map((transaction:any)=>{
            return {
                ...transaction,
                date: transaction.date.toISOString().split('T')[0] //format date to YYYY-MM-DD
            }
        })
        return formattedTransactions;
    } catch (error) {
        console.error("Error fetching transactions", error);
        return null;
        
    }

}

export async function getUserBalance(userId:number):Promise<number>{
    try {
        const transactions = await getRewardTransactions(userId) || []
        if(!transactions) return 0;
        const balance = transactions.reduce((acc:number,transaction:any)=>{

            return transaction.type.startsWith('earned') ? acc + transaction.amount : acc - transaction.amount;
                
            },0)
            return Math.max(balance,0);
    } catch (error) {
        console.error("Error fetching balance", error);
        return 0;
        
    }
}

export async function markNotificationAsRead(notificationId:number){
    try {
        await db.update(Notifications).set({isRead:true}).where(eq(Notifications.id,notificationId)).execute();
    } catch (error) {
        console.error("Error marking notification as read", error);
        
    }
}

