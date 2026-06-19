CREATE INDEX IF NOT EXISTS "collected_wastes_report_id_idx" ON "collected_wastes" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "collected_wastes_collector_id_idx" ON "collected_wastes" USING btree ("collector_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_user_id_is_read_idx" ON "notifications" USING btree ("user_id","is_read");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reports_user_id_idx" ON "reports" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reports_status_idx" ON "reports" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reports_collector_id_idx" ON "reports" USING btree ("collector_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reports_created_at_idx" ON "reports" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_user_id_date_idx" ON "transactions" USING btree ("user_id","date");