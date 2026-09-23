-- dishes.name becomes globally unique (was unique per (name, plan_id)) — a dish
-- shared across plans is two rows, and the admin UI showing the same name twice
-- read as an accidental duplicate. App is pre-launch / testing phase, so this
-- truncates dishes + dependents and relies on a reseed (db/seed.sql, updated
-- with plan-suffixed names) rather than an in-place rename, same pattern as
-- migration 0035.
TRUNCATE TABLE "meal_selections", "menu_items", "dishes" RESTART IDENTITY CASCADE;--> statement-breakpoint
DROP INDEX "dishes_name_plan_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "dishes_name_unique" ON "dishes" USING btree ("name");
