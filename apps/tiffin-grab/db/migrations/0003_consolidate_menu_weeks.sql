-- One menu week per week_start, for everyone.
--
-- menu_weeks.plan_type was the last place that still split the menu by plan type, while
-- dishes and categories had already moved to explicit membership (dish_plans,
-- category_plans). Keeping both meant two sources of truth for "who sees this dish", and
-- the readers disagreed: buildMealsGrid scoped categories with forPlan, resolveDeliveryMeal
-- with forPlanType's union. With the column gone there is one week, and membership alone
-- decides what each subscriber is offered.
--
-- Existing data has up to one tiffin row and one healthy row per week_start. They merge
-- into the lowest id; items and selections re-point to it.

CREATE TEMP TABLE week_merge ON COMMIT DROP AS
SELECT w.id AS from_id, c.keep_id AS to_id
FROM menu_weeks w
JOIN (SELECT week_start, MIN(id) AS keep_id FROM menu_weeks GROUP BY week_start) c
  ON c.week_start = w.week_start
WHERE w.id <> c.keep_id;
--> statement-breakpoint

-- The surviving row inherits the most advanced status of the group: if either week was
-- live, the merged week stays live rather than silently reverting to a draft.
UPDATE menu_weeks k
SET status = 'released',
    released_at = COALESCE(k.released_at, (
      SELECT MIN(w.released_at) FROM menu_weeks w
      JOIN week_merge m ON m.from_id = w.id
      WHERE m.to_id = k.id AND w.released_at IS NOT NULL))
WHERE EXISTS (
  SELECT 1 FROM menu_weeks w JOIN week_merge m ON m.from_id = w.id
  WHERE m.to_id = k.id AND w.status = 'released')
  AND k.status <> 'released';
--> statement-breakpoint

-- menu_items is unique on (week, day, slot, dish). Both plan types can legitimately carry
-- the same dish on the same day, so drop the losing duplicates before re-pointing.
DELETE FROM menu_items src
USING week_merge m
WHERE src.menu_week_id = m.from_id
  AND EXISTS (
    SELECT 1 FROM menu_items dst
    WHERE dst.menu_week_id = m.to_id
      AND dst.day_of_week = src.day_of_week
      AND dst.slot = src.slot
      AND dst.dish_id = src.dish_id);
--> statement-breakpoint

UPDATE menu_items src SET menu_week_id = m.to_id
FROM week_merge m WHERE src.menu_week_id = m.from_id;
--> statement-breakpoint

-- meal_selections is unique on (order, week, day, slot, person, pick). An order belongs to
-- exactly one plan, so it can only hold picks against one of the merged weeks and a
-- collision should be impossible — the guard is here so the migration cannot fail on data
-- that turns out otherwise.
DELETE FROM meal_selections src
USING week_merge m
WHERE src.menu_week_id = m.from_id
  AND EXISTS (
    SELECT 1 FROM meal_selections dst
    WHERE dst.menu_week_id = m.to_id
      AND dst.order_id = src.order_id
      AND dst.day_of_week = src.day_of_week
      AND dst.slot = src.slot
      AND dst.person_index = src.person_index
      AND dst.pick_index = src.pick_index);
--> statement-breakpoint

UPDATE meal_selections src SET menu_week_id = m.to_id
FROM week_merge m WHERE src.menu_week_id = m.from_id;
--> statement-breakpoint

DELETE FROM menu_weeks w USING week_merge m WHERE w.id = m.from_id;
--> statement-breakpoint

DROP INDEX IF EXISTS "menu_weeks_type_week_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX "menu_weeks_week_unique" ON "menu_weeks" ("week_start");
--> statement-breakpoint
ALTER TABLE "menu_weeks" DROP COLUMN "plan_type";
