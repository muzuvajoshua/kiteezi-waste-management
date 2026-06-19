CREATE TABLE IF NOT EXISTS "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"actor_user_id" integer,
	"action" varchar(100) NOT NULL,
	"target" varchar(255) NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"request_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_actor_user_id_created_at_idx" ON "audit_log" USING btree ("actor_user_id","created_at");