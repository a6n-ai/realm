ALTER TABLE "meal_slots" RENAME TO "dish_categories";
ALTER INDEX "meal_slots_type_key_unique" RENAME TO "dish_categories_type_key_unique";
ALTER TABLE "dish_categories" ADD COLUMN "selectable" boolean DEFAULT false NOT NULL;

ALTER TABLE "plans" ADD COLUMN "category_counts" jsonb DEFAULT '{}'::jsonb NOT NULL;

ALTER TABLE "meal_selections" ADD COLUMN "pick_index" integer DEFAULT 1 NOT NULL;
DROP INDEX IF EXISTS "meal_selections_unique";
CREATE UNIQUE INDEX "meal_selections_unique" ON "meal_selections"
  ("order_id","menu_week_id","day_of_week","slot","person_index","pick_index");

-- backfill: sabzi is the only selectable category
UPDATE "dish_categories" SET "selectable" = true WHERE "key" = 'sabzi';
