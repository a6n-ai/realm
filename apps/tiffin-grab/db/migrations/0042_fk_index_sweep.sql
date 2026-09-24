-- Postgres auto-indexes PRIMARY KEY / UNIQUE, never FOREIGN KEY. Sweep of every
-- remaining app-owned FK column with no supporting index (leading column of some
-- other index doesn't count — a lookup on the FK alone still seq scans).
-- Skips @foundry/@relay/better-auth-owned tables (wallet_ledger, notification_outbox,
-- files_file_system, invitation) — those need fixing in their own repos.
CREATE INDEX "dishes_plan_idx" ON "dishes" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "meal_sizes_plan_idx" ON "meal_sizes" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "meal_size_items_meal_size_idx" ON "meal_size_items" USING btree ("meal_size_id");--> statement-breakpoint
CREATE INDEX "meal_size_items_plan_idx" ON "meal_size_items" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "category_swap_pairs_to_category_idx" ON "category_swap_pairs" USING btree ("to_category_id");--> statement-breakpoint
CREATE INDEX "category_swap_pairs_plan_idx" ON "category_swap_pairs" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "category_plans_plan_idx" ON "category_plans" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "dish_category_addon_categories_addon_category_idx" ON "dish_category_addon_categories" USING btree ("addon_category_id");--> statement-breakpoint
CREATE INDEX "meal_selections_category_idx" ON "meal_selections" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "meal_selections_dish_idx" ON "meal_selections" USING btree ("dish_id");--> statement-breakpoint
-- main's 0039 added scope_plan_id/scope_meal_size_id "for indexed lookup" (per its
-- own comment) but never indexed them; legacy plan_id is still read until dropped.
CREATE INDEX "meal_rules_scope_plan_idx" ON "meal_rules" USING btree ("scope_plan_id");--> statement-breakpoint
CREATE INDEX "meal_rules_scope_meal_size_idx" ON "meal_rules" USING btree ("scope_meal_size_id");--> statement-breakpoint
CREATE INDEX "meal_rules_plan_idx" ON "meal_rules" USING btree ("plan_id");--> statement-breakpoint
-- Applied on prod by 0039's own SQL but never declared in the drizzle schema file.
CREATE INDEX IF NOT EXISTS "meal_rule_conditions_rule_idx" ON "meal_rule_conditions" USING btree ("rule_id");--> statement-breakpoint
CREATE INDEX "orders_meal_size_idx" ON "orders" USING btree ("meal_size_id");--> statement-breakpoint
CREATE INDEX "orders_frequency_idx" ON "orders" USING btree ("frequency_id");--> statement-breakpoint
CREATE INDEX "inquiries_sub_source_idx" ON "inquiries" USING btree ("sub_source_id");--> statement-breakpoint
CREATE INDEX "inquiries_zone_idx" ON "inquiries" USING btree ("zone_id");--> statement-breakpoint
CREATE INDEX "meal_payout_duration_package_idx" ON "meal_payout" USING btree ("duration_package_id");--> statement-breakpoint
CREATE INDEX "subscription_pauses_resumed_by_idx" ON "subscription_pauses" USING btree ("resumed_by");
