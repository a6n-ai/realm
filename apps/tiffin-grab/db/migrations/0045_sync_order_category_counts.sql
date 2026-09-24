-- Sync active, paused and pending orders' category_counts and meal_slots
-- with their current meal_size_items composition (Option A: Dynamic admin source of truth).
WITH item_counts AS (
  SELECT 
    meal_size_id,
    jsonb_object_agg(category, cnt) AS new_counts,
    array_agg(DISTINCT category) AS new_slots
  FROM (
    SELECT meal_size_id, category, count(*)::int AS cnt
    FROM meal_size_items
    GROUP BY meal_size_id, category
  ) sub
  GROUP BY meal_size_id
)
UPDATE orders o
SET 
  category_counts = ic.new_counts,
  meal_slots = ic.new_slots,
  updated_at = now()
FROM item_counts ic
WHERE o.meal_size_id = ic.meal_size_id
  AND o.status IN ('active', 'paused', 'pending');
