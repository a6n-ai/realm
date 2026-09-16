-- One-off, hand-run reset: wipes all customer/order data and the catalog it
-- referenced (categories, meal sizes, dishes, menu weeks), so db/seed.sql can
-- rebuild the catalog clean against the real pricing sheet without any
-- orders pinned to a meal_size/category that no longer exists.
--
-- NOT run automatically by anything — review it, then run it yourself against
-- prod (this session has no prod DB credentials). Table/column names verified
-- against db/schema/*.ts (orders.ts, coupons.ts, menu.ts, tickets.ts,
-- inquiries.ts, deliveries.ts, subscription-pauses.ts, category-swaps.ts) as
-- of this branch — re-check if the schema has moved since.
--
-- Order matters: children before parents, to satisfy FKs without a blanket
-- TRUNCATE ... CASCADE (which would empty shared tables like tickets/
-- inquiries/ledger_entries entirely, not just their order-linked rows).
--
-- After this runs, re-run db/seed.sql to rebuild the catalog.

BEGIN;

-- Nullify optional references into orders on tables that hold other data too
-- (tickets, inquiries, ledger_entries aren't order-only tables).
UPDATE tickets SET order_id = NULL WHERE order_id IS NOT NULL;
UPDATE inquiries SET converted_order_id = NULL WHERE converted_order_id IS NOT NULL;
UPDATE ledger_entries SET order_id = NULL WHERE order_id IS NOT NULL;

-- Order-dependent tables with a required (NOT NULL, no ON DELETE CASCADE)
-- order_id — must go before orders itself.
DELETE FROM payments;
DELETE FROM coupon_redemptions;

-- Everything below cascades from orders (ON DELETE CASCADE), listed
-- explicitly anyway for clarity/auditability.
DELETE FROM delivery_category_swaps;
DELETE FROM subscription_pauses;
DELETE FROM deliveries;
DELETE FROM order_addons;
DELETE FROM order_activities;
DELETE FROM meal_selections;
DELETE FROM orders;

-- Menu weeks/items are catalog content (this week's released menu), not
-- customer data, but they reference dishes/categories the reseed replaces.
DELETE FROM menu_items;
DELETE FROM menu_weeks;

-- Catalog: categories/meal sizes/dishes are about to be rebuilt by seed.sql.
DELETE FROM category_swap_pairs;
DELETE FROM meal_size_items;
DELETE FROM meal_sizes;
DELETE FROM dish_plans;
DELETE FROM dishes;
DELETE FROM category_plans;
DELETE FROM dish_category_addon_categories;
DELETE FROM dish_categories;

COMMIT;
