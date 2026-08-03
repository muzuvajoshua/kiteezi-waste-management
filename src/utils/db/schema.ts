import {integer, varchar, pgTable,serial,text, jsonb, timestamp,boolean, index, pgEnum, unique, check} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Enums (KWM-015) — replace free-text status/type columns with constrained
// Postgres enum types. Values for transaction_kind / collected_waste_status
// match the strings currently produced by utils/db/actions.ts so the
// conversion migration is non-destructive; KWM-011 introduces the canonical
// point-transaction model separately.
// ---------------------------------------------------------------------------
export const reportStatusEnum = pgEnum('report_status', [
  'pending', 'approved', 'in_progress', 'collected', 'verified', 'rejected',
]);

export const wasteTypeEnum = pgEnum('waste_type', [
  'general', 'plastic', 'organic', 'metal', 'paper', 'ewaste', 'hazardous', 'other',
]);

export const notificationTypeEnum = pgEnum('notification_type', [
  'reward', 'report_update', 'collection', 'system',
]);

export const transactionKindEnum = pgEnum('transaction_kind', [
  'earned_report', 'earned_collect', 'redeemed',
]);

export const collectedWasteStatusEnum = pgEnum('collected_waste_status', [
  'collected', 'verified',
]);

export type ReportStatus = (typeof reportStatusEnum.enumValues)[number];
export type WasteType = (typeof wasteTypeEnum.enumValues)[number];
export type NotificationType = (typeof notificationTypeEnum.enumValues)[number];
export type TransactionKind = (typeof transactionKindEnum.enumValues)[number];
export type CollectedWasteStatus = (typeof collectedWasteStatusEnum.enumValues)[number];


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
    wasteType: wasteTypeEnum('waste_type').notNull(),
    amount: varchar('amount', {length:255}).notNull(),
    imageUrl: text('image_url'),
    verificationResult: jsonb('verification_result'),
    status: reportStatusEnum('status').notNull().default('pending'),
    created_at: timestamp('created_at').defaultNow().notNull(),
    collector_id: integer('collector_id').references(() =>Users.id),
}, (table) => ({
    userIdIdx: index('reports_user_id_idx').on(table.user_id),
    statusIdx: index('reports_status_idx').on(table.status),
    collectorIdIdx: index('reports_collector_id_idx').on(table.collector_id),
    createdAtIdx: index('reports_created_at_idx').on(table.created_at),
}));

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
    status: collectedWasteStatusEnum('status').notNull().default('collected'),
}, (table) => ({
    reportIdIdx: index('collected_wastes_report_id_idx').on(table.reportId),
    collectorIdIdx: index('collected_wastes_collector_id_idx').on(table.collectorId),
}));

export const Notifications = pgTable('notifications', {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull().references(() =>Users.id),
    message: text('message').notNull(),
    type: notificationTypeEnum('type').notNull(),
    isRead: boolean('is_read').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
    userIdIsReadIdx: index('notifications_user_id_is_read_idx').on(table.userId, table.isRead),
}));

export const Transactions = pgTable('transactions', {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull().references(() =>Users.id),
    amount: integer('amount').notNull(),
    type: transactionKindEnum('type').notNull(),
    description: text('description'),
    date: timestamp('date').defaultNow().notNull(),
}, (table) => ({
    userIdDateIdx: index('transactions_user_id_date_idx').on(table.userId, table.date),
}));

// audit_log (KWM-016) — append-only record of privileged mutations. actor is
// nullable so system / unauthenticated actions can still be recorded; before /
// after hold the entity snapshots around the change.
export const AuditLog = pgTable('audit_log', {
    id: serial('id').primaryKey(),
    actorUserId: integer('actor_user_id').references(() => Users.id),
    action: varchar('action', {length: 100}).notNull(),
    target: varchar('target', {length: 255}).notNull(),
    before: jsonb('before'),
    after: jsonb('after'),
    requestId: text('request_id'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
    actorCreatedAtIdx: index('audit_log_actor_user_id_created_at_idx').on(table.actorUserId, table.createdAt),
}));

// ---------------------------------------------------------------------------
// RBAC (KWM-008) — normalised roles. `roles` is a seeded catalog; `user_roles`
// is the many-to-many grant table carrying an audit trail (granted_at /
// granted_by). Role *names* are the source of truth for authorization; the
// canonical set is ROLE_NAMES, seeded by migration 0004.
// ---------------------------------------------------------------------------
export const ROLE_NAMES = ['citizen', 'operator', 'supervisor', 'admin', 'dump_op'] as const;
export type Role = (typeof ROLE_NAMES)[number];

export const Roles = pgTable('roles', {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 50 }).notNull().unique(),
    description: text('description'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const UserRoles = pgTable('user_roles', {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull().references(() => Users.id, { onDelete: 'cascade' }),
    roleId: integer('role_id').notNull().references(() => Roles.id, { onDelete: 'restrict' }),
    grantedAt: timestamp('granted_at').defaultNow().notNull(),
    grantedBy: integer('granted_by').references(() => Users.id, { onDelete: 'set null' }),
}, (table) => ({
    userIdIdx: index('user_roles_user_id_idx').on(table.userId),
    userRoleUnique: unique('user_roles_user_id_role_id_unique').on(table.userId, table.roleId),
}));

// ---------------------------------------------------------------------------
// Reward ledger (KWM-011) — replaces the conflated `rewards`/`transactions`
// model. `point_transactions` is the append-only signed ledger (source of
// truth: earn>0, redeem<0); `user_reward_balance` is the materialised balance
// kept in lockstep inside a transaction; `reward_catalog` holds redeemable
// items. The legacy `Rewards`/`Transactions` tables remain until a follow-up
// migration retires them after a verification soak.
// ---------------------------------------------------------------------------
export const pointKindEnum = pgEnum('point_kind', ['earn_report', 'earn_collect', 'redeem', 'adjust']);
export type PointKind = (typeof pointKindEnum.enumValues)[number];

export const RewardCatalog = pgTable('reward_catalog', {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    costPoints: integer('cost_points').notNull(),
    isAvailable: boolean('is_available').notNull().default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
    costNonNeg: check('reward_catalog_cost_points_nonneg', sql`${table.costPoints} >= 0`),
}));

export const UserRewardBalance = pgTable('user_reward_balance', {
    userId: integer('user_id').primaryKey().references(() => Users.id, { onDelete: 'cascade' }),
    points: integer('points').notNull().default(0),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
    pointsNonNeg: check('user_reward_balance_points_nonneg', sql`${table.points} >= 0`),
}));

export const PointTransactions = pgTable('point_transactions', {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull().references(() => Users.id, { onDelete: 'cascade' }),
    kind: pointKindEnum('kind').notNull(),
    amount: integer('amount').notNull(), // signed: earn > 0, redeem < 0
    relatedReportId: integer('related_report_id').references(() => Reports.id),
    relatedRedemptionId: integer('related_redemption_id'),
    idempotencyKey: varchar('idempotency_key', { length: 255 }).unique(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
    userCreatedAtIdx: index('point_transactions_user_id_created_at_idx').on(table.userId, table.createdAt),
}));
