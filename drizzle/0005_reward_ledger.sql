CREATE TYPE "public"."point_kind" AS ENUM('earn_report', 'earn_collect', 'redeem', 'adjust');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "point_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"kind" "point_kind" NOT NULL,
	"amount" integer NOT NULL,
	"related_report_id" integer,
	"related_redemption_id" integer,
	"idempotency_key" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "point_transactions_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reward_catalog" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"cost_points" integer NOT NULL,
	"is_available" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "reward_catalog_cost_points_nonneg" CHECK ("reward_catalog"."cost_points" >= 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_reward_balance" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"points" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_reward_balance_points_nonneg" CHECK ("user_reward_balance"."points" >= 0)
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "point_transactions" ADD CONSTRAINT "point_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "point_transactions" ADD CONSTRAINT "point_transactions_related_report_id_reports_id_fk" FOREIGN KEY ("related_report_id") REFERENCES "public"."reports"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_reward_balance" ADD CONSTRAINT "user_reward_balance_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "point_transactions_user_id_created_at_idx" ON "point_transactions" USING btree ("user_id","created_at");--> statement-breakpoint

-- KWM-011 data steps (hand-added; not emitted by drizzle-kit). Idempotent and
-- fail-loud. Reconstructs the ledger + materialised balance from the legacy
-- `transactions` table and preserves the invariant
--   SUM(point_transactions.amount) == user_reward_balance.points  (per user).

-- 1) Every user starts with a zero balance row.
INSERT INTO "user_reward_balance" ("user_id", "points")
SELECT "id", 0 FROM "users"
ON CONFLICT ("user_id") DO NOTHING;--> statement-breakpoint

-- 2) Backfill the append-only ledger from legacy transactions (redeem -> negative).
--    legacy:txn:<id> idempotency keys make this safe to re-run.
INSERT INTO "point_transactions" ("user_id", "kind", "amount", "created_at", "idempotency_key")
SELECT "user_id",
	(CASE "type"
		WHEN 'earned_report'  THEN 'earn_report'
		WHEN 'earned_collect' THEN 'earn_collect'
		WHEN 'redeemed'       THEN 'redeem'
	END)::"point_kind",
	(CASE WHEN "type" = 'redeemed' THEN -"amount" ELSE "amount" END),
	"date",
	'legacy:txn:' || "id"
FROM "transactions"
ON CONFLICT ("idempotency_key") DO NOTHING;--> statement-breakpoint

-- 3) Fail loud: a negative reconstructed balance means corrupt legacy data.
--    RAISE rolls back the whole migration (no clamping, no silent data loss).
DO $$
DECLARE bad integer;
BEGIN
	SELECT count(*) INTO bad FROM (
		SELECT "user_id" FROM "point_transactions" GROUP BY "user_id" HAVING SUM("amount") < 0
	) q;
	IF bad > 0 THEN
		RAISE EXCEPTION 'KWM-011 abort: % user(s) reconstruct to a negative balance; investigate before migrating', bad;
	END IF;
END $$;--> statement-breakpoint

-- 4) Set the materialised balance to the EXACT ledger sum (no GREATEST clamp),
--    preserving SUM(ledger) == balance. The CHECK(points >= 0) is the backstop.
INSERT INTO "user_reward_balance" ("user_id", "points")
SELECT "user_id", SUM("amount") FROM "point_transactions" GROUP BY "user_id"
ON CONFLICT ("user_id") DO UPDATE SET "points" = EXCLUDED."points", "updated_at" = now();