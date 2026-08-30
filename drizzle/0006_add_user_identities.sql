-- KWM: auth identities. HAND-HARDENED after generation — see
-- docs/db/migrations.md "Hand-hardened migrations". Two changes from the
-- drizzle-kit draft:
--
--   1. CREATE TYPE is wrapped in a duplicate_object guard. The draft emitted a
--      bare CREATE TYPE, which aborts on replay; every other migration in this
--      history is replay-safe (IF NOT EXISTS / guarded constraints) and this
--      one must be too.
--   2. Added a CHECK tying password_hash to provider = 'password'. Without it
--      nothing at the storage layer stops an oauth row carrying a hash, or a
--      password row carrying none — the same reasoning as
--      user_reward_balance's CHECK(points >= 0): invariants the application
--      must never be the only thing enforcing.

DO $$ BEGIN
 CREATE TYPE "public"."auth_provider" AS ENUM('google', 'password');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_identities" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"provider" "auth_provider" NOT NULL,
	"provider_subject" varchar(255) NOT NULL,
	"password_hash" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_used_at" timestamp,
	CONSTRAINT "user_identities_provider_subject_unique" UNIQUE("provider","provider_subject"),
	CONSTRAINT "user_identities_user_id_provider_unique" UNIQUE("user_id","provider")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_identities" ADD CONSTRAINT "user_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_identities" ADD CONSTRAINT "user_identities_password_hash_matches_provider" CHECK (
   ("provider" = 'password' AND "password_hash" IS NOT NULL)
   OR ("provider" <> 'password' AND "password_hash" IS NULL)
 );
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_identities_user_id_idx" ON "user_identities" USING btree ("user_id");
