-- Which composition row of from_category a swap gave up (0 = first row in sortOrder).
-- NULL keeps the old meaning: the first row still there.
ALTER TABLE "delivery_category_swaps" ADD COLUMN "from_row" integer;
