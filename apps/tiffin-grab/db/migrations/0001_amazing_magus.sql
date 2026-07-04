ALTER TABLE "menu_weeks" DROP CONSTRAINT "menu_weeks_week_start_unique";--> statement-breakpoint
ALTER TABLE "menu_items" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "menu_weeks" ADD COLUMN "plan_type" "plan_type" DEFAULT 'tiffin' NOT NULL;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "meal_types" jsonb;--> statement-breakpoint
CREATE UNIQUE INDEX "menu_weeks_type_week_unique" ON "menu_weeks" USING btree ("plan_type","week_start");