-- Tables owned by @foundry/@relay/better-auth: not in this app's drizzle schema, so plain SQL.
CREATE INDEX IF NOT EXISTS "audit_log_entity_idx" ON "audit_log" USING btree ("entity","entity_public_id","created_at");--> statement-breakpoint
-- drain() polls status='pending' AND next_attempt_at<=now with no kind filter, so the
-- (kind, status, next_attempt_at) index cannot serve it (403k seq scans on prod).
CREATE INDEX IF NOT EXISTS "notification_outbox_pending_idx" ON "notification_outbox" USING btree ("next_attempt_at") WHERE "status" = 'pending';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_outbox_provider_message_idx" ON "notification_outbox" USING btree ("provider_message_id") WHERE "provider_message_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_outbox_recipient_idx" ON "notification_outbox" USING btree ("recipient_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_unread_idx" ON "notifications" USING btree ("user_id") WHERE "read_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "session_expires_idx" ON "session" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "verification_expires_idx" ON "verification" USING btree ("expires_at");--> statement-breakpoint
-- NOT VALID: enforced for new writes without scanning or locking on deploy. Run
-- ALTER TABLE ... VALIDATE CONSTRAINT after checking prod rows.
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_nonneg_chk" CHECK ("amount" >= 0) NOT VALID;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_amount_nonneg_chk" CHECK ("amount" >= 0) NOT VALID;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_total_nonneg_chk" CHECK ("total" >= 0) NOT VALID;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_counts_positive_chk" CHECK ("persons" > 0 AND "duration_weeks" > 0 AND "tiffin_count" > 0 AND "pooled_tiffin_count" >= 0) NOT VALID;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_tiffin_units_nonneg_chk" CHECK ("tiffin_units" >= 0) NOT VALID;--> statement-breakpoint
ALTER TABLE "order_addons" ADD CONSTRAINT "order_addons_qty_positive_chk" CHECK ("qty" > 0) NOT VALID;--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_pct_range_chk" CHECK (("value_pct" IS NULL OR "value_pct" BETWEEN 0 AND 100) AND ("cap_pct" IS NULL OR "cap_pct" BETWEEN 0 AND 100) AND "redemption_count" >= 0) NOT VALID;
