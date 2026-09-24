-- Dish -> single plan (was many-to-many via dish_plans). App is pre-launch /
-- testing phase, so this truncates catalog + menu data rather than backfilling —
-- reseed after migrating (pnpm --filter tiffin-grab exec vitest run --config
-- vitest.seed.config.ts db/seed-qa-plans.test.ts).
TRUNCATE TABLE "meal_selections", "menu_items", "meal_size_items", "dish_plans", "category_swap_pair_plans", "dishes" RESTART IDENTITY CASCADE;--> statement-breakpoint
DROP TABLE "dish_plans";--> statement-breakpoint
DROP TABLE "category_swap_pair_plans";--> statement-breakpoint
ALTER TABLE "plans" DROP COLUMN "restricted";--> statement-breakpoint
ALTER TABLE "dishes" ADD COLUMN "plan_id" bigint NOT NULL;--> statement-breakpoint
ALTER TABLE "dishes" ADD CONSTRAINT "dishes_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dishes_name_plan_unique" ON "dishes" USING btree ("name","plan_id");--> statement-breakpoint
ALTER TABLE "meal_size_items" ADD COLUMN "plan_id" bigint NOT NULL;--> statement-breakpoint
ALTER TABLE "meal_size_items" ADD CONSTRAINT "meal_size_items_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;
