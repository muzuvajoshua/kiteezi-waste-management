import {integer, varchar, pgTable,serial,text, jsonb, timestamp,boolean, PgUpdateBase} from 'drizzle-orm/pg-core';


export const Users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: varchar('name',{length: 255}).notNull(),
  email: varchar('email',{length: 255}).notNull().unique(),
  created_at: timestamp('created_at').defaultNow().notNull(),
});

export const Reports = pgTable('reports', {
    id: serial('id').primaryKey(),
    user_id: integer('user_id').notNull().references(() =>Users.id),
    location: text('location').notNull(),
    wasteType: varchar('waste_type', {length:255}).notNull(),
    amount: varchar('amount', {length:255}).notNull(),
    imageUrl: text('image_url'),
    verificationResult: jsonb('verification_result'),
    status: varchar('status',{length:255}).notNull().default('pending'),
    created_at: timestamp('created_at').defaultNow().notNull(),
    collector_id: integer('collector_id').references(() =>Users.id),
});

export const Rewards = pgTable('rewards', {
    id: serial('id').primaryKey(),
    user_id: integer('user_id').notNull().references(() =>Users.id),
    points: integer('points').notNull().default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    isAvailable: boolean('is_available').notNull().default(true),
    description: text('description'),
    name: varchar('name',{length: 255}).notNull(),
    collectionInfor:text('collection_info'),
});

export const CollectedWastes = pgTable('collected_wastes', {
    id: serial('id').primaryKey(),
    reportId:integer('report_id').notNull().references(() =>Reports.id),
    collectorId: integer('collector_id').notNull().references(() =>Users.id),
    collectionDate: timestamp('collection_date').defaultNow().notNull(),
    status: varchar('status',{length:255}).notNull().default('collected'),
});

export const Notifications = pgTable('notifications', {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull().references(() =>Users.id),
    message: text('message').notNull(),
    type: varchar('type',{length:50}).notNull(),
    isRead: boolean('is_read').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const Transactions = pgTable('transactions', {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull().references(() =>Users.id),
    amount: integer('amount').notNull(),
    type: varchar('type',{length:20}).notNull(),
    description: text('description'),
    date: timestamp('date').defaultNow().notNull(),
});
