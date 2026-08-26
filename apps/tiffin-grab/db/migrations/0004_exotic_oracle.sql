ALTER TABLE "addons" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "delivery_frequencies" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "delivery_zones" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "dishes" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "duration_packages" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "meal_sizes" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "pricing_tiers" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "order_activities" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "coupons" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "inquiries" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "inquiry_activities" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "ticket_messages" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "inquiry_user_config" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "category_plans" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "category_swap_pairs" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "dish_categories" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "meal_selections" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "menu_items" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "menu_weeks" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "delivery_category_swaps" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "meal_payout" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "subscription_pauses" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "addons" ADD CONSTRAINT "addons_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_frequencies" ADD CONSTRAINT "delivery_frequencies_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_zones" ADD CONSTRAINT "delivery_zones_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dishes" ADD CONSTRAINT "dishes_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duration_packages" ADD CONSTRAINT "duration_packages_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_sizes" ADD CONSTRAINT "meal_sizes_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_tiers" ADD CONSTRAINT "pricing_tiers_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_activities" ADD CONSTRAINT "order_activities_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiry_activities" ADD CONSTRAINT "inquiry_activities_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiry_user_config" ADD CONSTRAINT "inquiry_user_config_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_plans" ADD CONSTRAINT "category_plans_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_swap_pairs" ADD CONSTRAINT "category_swap_pairs_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dish_categories" ADD CONSTRAINT "dish_categories_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_selections" ADD CONSTRAINT "meal_selections_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_weeks" ADD CONSTRAINT "menu_weeks_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_category_swaps" ADD CONSTRAINT "delivery_category_swaps_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_payout" ADD CONSTRAINT "meal_payout_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_pauses" ADD CONSTRAINT "subscription_pauses_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_activities_organization_idx" ON "order_activities" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "payments_organization_idx" ON "payments" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "deliveries_organization_idx" ON "deliveries" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "coupon_redemptions_organization_idx" ON "coupon_redemptions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "ledger_organization_idx" ON "ledger_entries" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "inquiries_organization_idx" ON "inquiries" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "inquiry_activities_organization_idx" ON "inquiry_activities" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "ticket_messages_organization_idx" ON "ticket_messages" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "tickets_organization_idx" ON "tickets" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "inquiry_user_config_organization_idx" ON "inquiry_user_config" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "delivery_category_swaps_organization_idx" ON "delivery_category_swaps" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "subscription_pauses_organization_idx" ON "subscription_pauses" USING btree ("organization_id");