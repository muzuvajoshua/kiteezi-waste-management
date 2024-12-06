import {db} from "./dbConfig";
import { Users, Notifications } from "./schema";

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
        const notifications = await db.select().from(Notifications).where(and(eq(Notifications.userId,userId),
            eq(Notifications.isRead,false))
        ).orderBy(desc(Notifications.createdAt)).execute();and
        return notifications;
    } catch (error) {
        console.error("Error fetching notifications", error);
        return [];
    }
}