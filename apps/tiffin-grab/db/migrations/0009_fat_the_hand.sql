CREATE INDEX "users_address_tag_idx" ON "users" USING btree ("address_tag_id");--> statement-breakpoint
CREATE INDEX "users_delivery_strategy_idx" ON "users" USING btree ("delivery_strategy_id");--> statement-breakpoint
CREATE INDEX "orders_delivery_tag_idx" ON "orders" USING btree ("delivery_tag_id");--> statement-breakpoint
CREATE INDEX "deliveries_delivery_tag_idx" ON "deliveries" USING btree ("delivery_tag_id");--> statement-breakpoint
CREATE INDEX "custom_meal_pricing_plan_idx" ON "custom_meal_pricing" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "menu_items_category_idx" ON "menu_items" USING btree ("category_id");--> statement-breakpoint
-- order_activities.delivery_id has no drizzle .references() (orders -> deliveries -> orders would
-- cycle), so its FK lives here. SET NULL keeps the activity when its delivery is rebuilt or removed.
ALTER TABLE "order_activities" ADD CONSTRAINT "order_activities_delivery_id_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."deliveries"("id") ON DELETE set null ON UPDATE no action;
