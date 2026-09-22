-- Naming: <table>_<cols>_idx / <table>_<cols>_unique. Renames are metadata-only, so the
-- unique guards are never dropped.
ALTER TABLE "user_feature_flags" RENAME CONSTRAINT "user_feature_flags_user_flag_uq" TO "user_feature_flags_user_flag_unique";--> statement-breakpoint
ALTER TABLE "inquiry_user_config" RENAME CONSTRAINT "inquiry_user_config_user_source_unq" TO "inquiry_user_config_user_source_unique";--> statement-breakpoint
ALTER INDEX "coupons_rep_daily_unq" RENAME TO "coupons_rep_daily_unique";--> statement-breakpoint
ALTER INDEX "inquiries_open_phone_source_uq" RENAME TO "inquiries_open_phone_source_unique";--> statement-breakpoint
ALTER INDEX "subscription_pauses_one_open_uniq" RENAME TO "subscription_pauses_one_open_unique";--> statement-breakpoint
ALTER INDEX "ledger_user_created_idx" RENAME TO "ledger_entries_user_created_idx";--> statement-breakpoint
ALTER INDEX "ledger_order_idx" RENAME TO "ledger_entries_order_idx";--> statement-breakpoint
ALTER INDEX "ledger_organization_idx" RENAME TO "ledger_entries_organization_idx";--> statement-breakpoint
-- Duplicate of deliveries_order_date_unique (same columns).
DROP INDEX "deliveries_order_date_idx";--> statement-breakpoint
-- FK columns that had no supporting index.
CREATE INDEX "user_feature_flags_flag_idx" ON "user_feature_flags" USING btree ("flag_id");--> statement-breakpoint
CREATE INDEX "order_activities_delivery_idx" ON "order_activities" USING btree ("delivery_id");--> statement-breakpoint
CREATE INDEX "orders_plan_idx" ON "orders" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "orders_zone_idx" ON "orders" USING btree ("zone_id");--> statement-breakpoint
CREATE INDEX "deliveries_date_idx" ON "deliveries" USING btree ("delivery_date");--> statement-breakpoint
CREATE INDEX "deliveries_zone_idx" ON "deliveries" USING btree ("zone_id");--> statement-breakpoint
CREATE INDEX "deliveries_merged_into_idx" ON "deliveries" USING btree ("merged_into_delivery_id") WHERE "deliveries"."merged_into_delivery_id" is not null;--> statement-breakpoint
CREATE INDEX "coupon_redemptions_redeemed_by_idx" ON "coupon_redemptions" USING btree ("redeemed_by");--> statement-breakpoint
CREATE INDEX "ledger_entries_payment_idx" ON "ledger_entries" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "inquiries_stage_created_idx" ON "inquiries" USING btree ("stage","created_at");--> statement-breakpoint
CREATE INDEX "inquiries_source_idx" ON "inquiries" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "inquiries_converted_order_idx" ON "inquiries" USING btree ("converted_order_id");--> statement-breakpoint
CREATE INDEX "ticket_messages_author_idx" ON "ticket_messages" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "tickets_order_idx" ON "tickets" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "meal_selections_menu_week_idx" ON "meal_selections" USING btree ("menu_week_id");--> statement-breakpoint
CREATE INDEX "menu_items_dish_idx" ON "menu_items" USING btree ("dish_id");
