-- menu_items.slot and meal_selections.slot were free text pointing at dish_categories.key
-- by string. Nothing enforced the reference, so renaming a category key silently orphaned
-- every row that used it — and the seed itself shipped 25 items pointing at 'lunch', which
-- was never a category at all. A foreign key makes that class of drift unrepresentable.
--
-- The application still speaks in category keys (the client, the poster and the meal grid
-- all use them); only storage changes, and the service joins to translate at the boundary.

ALTER TABLE "menu_items" ADD COLUMN "category_id" bigint;
--> statement-breakpoint
ALTER TABLE "meal_selections" ADD COLUMN "category_id" bigint;
--> statement-breakpoint

UPDATE "menu_items" mi SET "category_id" = dc."id"
FROM "dish_categories" dc WHERE dc."key" = mi."slot";
--> statement-breakpoint
UPDATE "meal_selections" ms SET "category_id" = dc."id"
FROM "dish_categories" dc WHERE dc."key" = ms."slot";
--> statement-breakpoint

-- Rows whose slot names no category cannot be expressed once the FK exists, and they were
-- already dead: resolveDeliveryMeal looks categories up by key, so an unresolvable slot has
-- never rendered anything for a subscriber.
DELETE FROM "menu_items" WHERE "category_id" IS NULL;
--> statement-breakpoint
DELETE FROM "meal_selections" WHERE "category_id" IS NULL;
--> statement-breakpoint

ALTER TABLE "menu_items" ALTER COLUMN "category_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "meal_selections" ALTER COLUMN "category_id" SET NOT NULL;
--> statement-breakpoint

-- RESTRICT, not CASCADE: deleting a category that a menu still uses should fail loudly.
-- dish_categories.delete() already soft-deletes by flipping `enabled`, so this only fires
-- on a genuine hard delete.
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_category_id_dish_categories_id_fk"
  FOREIGN KEY ("category_id") REFERENCES "dish_categories"("id") ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "meal_selections" ADD CONSTRAINT "meal_selections_category_id_dish_categories_id_fk"
  FOREIGN KEY ("category_id") REFERENCES "dish_categories"("id") ON DELETE RESTRICT;
--> statement-breakpoint

DROP INDEX IF EXISTS "menu_items_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX "menu_items_unique" ON "menu_items" ("menu_week_id", "day_of_week", "category_id", "dish_id");
--> statement-breakpoint
DROP INDEX IF EXISTS "meal_selections_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX "meal_selections_unique" ON "meal_selections" ("order_id", "menu_week_id", "day_of_week", "category_id", "person_index", "pick_index");
--> statement-breakpoint

ALTER TABLE "menu_items" DROP COLUMN "slot";
--> statement-breakpoint
ALTER TABLE "meal_selections" DROP COLUMN "slot";
