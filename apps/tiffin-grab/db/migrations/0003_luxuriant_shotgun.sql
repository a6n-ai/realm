-- meal_sizes.plan_id is NOT NULL with no default, so this ADD COLUMN fails on any
-- DB that already holds meal_sizes rows. This delta therefore requires a
-- rebuild-from-empty: migrate runs before seed on a fresh DB, and the seed
-- populates plan_id per row via a plans-key subquery. Safe here — pre-launch, no
-- seeded orders. plan_type + diet (and the now-orphaned meal_diet enum) are dropped.
ALTER TABLE "meal_sizes" ADD COLUMN "plan_id" bigint NOT NULL;--> statement-breakpoint
ALTER TABLE "meal_sizes" ADD CONSTRAINT "meal_sizes_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_sizes" DROP COLUMN "plan_type";--> statement-breakpoint
ALTER TABLE "meal_sizes" DROP COLUMN "diet";--> statement-breakpoint
DROP TYPE "public"."meal_diet";