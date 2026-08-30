-- KWM-054: rate_limit_counters. HAND-HARDENED after generation, per
-- docs/db/migrations.md.
--
-- drizzle-kit also emitted an ALTER TABLE re-adding user_identities'
-- password_hash CHECK. That constraint is already created by 0006 (guarded),
-- and re-adding it would abort this migration on any database where 0006 has
-- run. It was emitted because 0006 was hand-hardened AFTER its snapshot was
-- written, so meta/0006_snapshot.json did not record the constraint and the
-- diff saw it as new. The redundant statement is removed here and the 0006
-- snapshot has been backfilled so the drift does not recur.

CREATE TABLE IF NOT EXISTS "rate_limit_counters" (
	"bucket_key" varchar(255) NOT NULL,
	"window_start" timestamp NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp NOT NULL,
	CONSTRAINT "rate_limit_counters_bucket_key_window_start_pk" PRIMARY KEY("bucket_key","window_start")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rate_limit_counters_expires_at_idx" ON "rate_limit_counters" USING btree ("expires_at");
