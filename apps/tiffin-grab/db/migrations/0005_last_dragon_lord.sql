DROP INDEX "subscription_pauses_open_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_pauses_one_open_uniq" ON "subscription_pauses" USING btree ("order_id") WHERE resumed_at is null;