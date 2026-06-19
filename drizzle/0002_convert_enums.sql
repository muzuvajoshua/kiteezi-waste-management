-- KWM-015: convert free-text status/type columns to Postgres enums.
-- Hand-hardened from the drizzle-kit draft: varchar -> enum requires an explicit
-- USING cast, defaults must be dropped before and restored after the type change,
-- and legacy/free-text values are normalised so the cast cannot fail on existing
-- rows. End state is identical to drizzle/meta/0002_snapshot.json.

CREATE TYPE "public"."collected_waste_status" AS ENUM('collected', 'verified');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('reward', 'report_update', 'collection', 'system');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('pending', 'approved', 'in_progress', 'collected', 'verified', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."transaction_kind" AS ENUM('earned_report', 'earned_collect', 'redeemed');--> statement-breakpoint
CREATE TYPE "public"."waste_type" AS ENUM('general', 'plastic', 'organic', 'metal', 'paper', 'ewaste', 'hazardous', 'other');--> statement-breakpoint

-- reports.status (has DEFAULT 'pending') -------------------------------------
ALTER TABLE "reports" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
UPDATE "reports" SET "status" = 'pending'
  WHERE "status" NOT IN ('pending', 'approved', 'in_progress', 'collected', 'verified', 'rejected');--> statement-breakpoint
ALTER TABLE "reports" ALTER COLUMN "status" SET DATA TYPE report_status USING "status"::report_status;--> statement-breakpoint
ALTER TABLE "reports" ALTER COLUMN "status" SET DEFAULT 'pending';--> statement-breakpoint

-- reports.waste_type (free-text user input, NOT NULL, no default) ------------
UPDATE "reports" SET "waste_type" = CASE lower(trim("waste_type"))
  WHEN 'general'     THEN 'general'
  WHEN 'plastic'     THEN 'plastic'
  WHEN 'plastics'    THEN 'plastic'
  WHEN 'organic'     THEN 'organic'
  WHEN 'organics'    THEN 'organic'
  WHEN 'metal'       THEN 'metal'
  WHEN 'metals'      THEN 'metal'
  WHEN 'paper'       THEN 'paper'
  WHEN 'ewaste'      THEN 'ewaste'
  WHEN 'e-waste'     THEN 'ewaste'
  WHEN 'electronic'  THEN 'ewaste'
  WHEN 'electronics' THEN 'ewaste'
  WHEN 'hazardous'   THEN 'hazardous'
  WHEN 'hazard'      THEN 'hazardous'
  ELSE 'other'
END;--> statement-breakpoint
ALTER TABLE "reports" ALTER COLUMN "waste_type" SET DATA TYPE waste_type USING "waste_type"::waste_type;--> statement-breakpoint

-- notifications.type (NOT NULL, no default) ----------------------------------
UPDATE "notifications" SET "type" = 'system'
  WHERE "type" NOT IN ('reward', 'report_update', 'collection', 'system');--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "type" SET DATA TYPE notification_type USING "type"::notification_type;--> statement-breakpoint

-- transactions.type (NOT NULL, no default; values are code-controlled) -------
ALTER TABLE "transactions" ALTER COLUMN "type" SET DATA TYPE transaction_kind USING "type"::transaction_kind;--> statement-breakpoint

-- collected_wastes.status (has DEFAULT 'collected') -------------------------
ALTER TABLE "collected_wastes" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
UPDATE "collected_wastes" SET "status" = 'collected'
  WHERE "status" NOT IN ('collected', 'verified');--> statement-breakpoint
ALTER TABLE "collected_wastes" ALTER COLUMN "status" SET DATA TYPE collected_waste_status USING "status"::collected_waste_status;--> statement-breakpoint
ALTER TABLE "collected_wastes" ALTER COLUMN "status" SET DEFAULT 'collected';
