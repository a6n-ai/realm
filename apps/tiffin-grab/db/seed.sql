-- Catalog seed: lead sources, plans, meal sizes, delivery frequencies/zones,
-- pricing, feature flags, app settings, wallet, dish categories, dishes and the
-- first menu week. No notification templates (authored via UI).
--
-- Contains NO logins, so it is safe to run against production. The first admin comes
-- from db/seed-admin.ts with an operator-supplied password (single-use: passwordSet
-- stays false, so the dashboard forces /set-password on first login). There is no
-- committed-credential seed any more — the old db/seed-dev-staff.sql carried a password
-- hash in a public repo.
-- id -> next_id() (DB). public_id/created_at/updated_at have NO db default -> supplied here.
-- Idempotent: ON CONFLICT (<unique>) DO NOTHING; tables without a unique key use NOT EXISTS
-- guards. pricing_tiers has no unique key -> wipe+insert.
-- Epoch-ms helper repeated inline: (extract(epoch from now())*1000)::bigint

BEGIN;

-- ============ APP (tenant singleton) ============
-- Must be first: every other row resolves app_id via current_app_id(), which
-- reads this row. Sets id and app_id to the same value (self-reference) since no
-- app exists yet for the default to resolve.
INSERT INTO app (id, public_id, app_id, created_at, updated_at, timezone, cutoff_hour, currency, meal_types)
SELECT v.id,
       'aps_default',
       v.id,
       (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
       (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
       'America/Toronto',
       18,
       'CAD',
       '{
         "tiffin": {
           "accent": "#F0820A",
           "titlePrefix": "Tiffin Menu"
         }
       }'::jsonb
FROM (SELECT next_id() AS id) v
WHERE NOT EXISTS (SELECT 1 FROM app);

-- ============ LEAD SOURCES ============
INSERT INTO lead_sources (public_id, created_at, updated_at, key, label, is_inbound)
VALUES ('lsr_manual', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, 'manual',
        'Manual', FALSE),
       ('lsr_referral', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        'referral', 'Referral', TRUE),
       ('lsr_website', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        'website', 'Website', TRUE),
       ('lsr_google', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, 'google',
        'Google', TRUE),
       ('lsr_facebook', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        'facebook', 'Facebook', TRUE),
       ('lsr_instagram', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        'instagram', 'Instagram', TRUE)
ON CONFLICT (key) DO NOTHING;

-- ============ LEAD SUBSOURCES ============ (key not unique -> guard with NOT EXISTS)
INSERT INTO lead_subsources (public_id, created_at, updated_at, source_id, key, label)
SELECT v.public_id,
       (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
       (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
       (SELECT id FROM lead_sources WHERE key = v.source_key),
       v.key,
       v.label
FROM (VALUES ('lss_web_direct', 'website', 'direct', 'Direct'),
             ('lss_fb_feed', 'facebook', 'facebook_feed', 'Facebook Feed'),
             ('lss_fb_ads', 'facebook', 'facebook_ads', 'Facebook Ads'),
             ('lss_ig_reels', 'instagram', 'instagram_reels',
              'Instagram Reels')) AS v(public_id, source_key, key, label)
WHERE NOT EXISTS (SELECT 1 FROM lead_subsources s WHERE s.key = v.key);

-- ============ PLANS ============
-- Healthy plan dropped for now (pre-launch, veg/non-veg only). plans.restricted
-- dropped too: diet-direction eligibility now comes from dishes.plan_id directly
-- (a dish belongs to exactly one plan), not a per-plan restriction flag.
INSERT INTO plans (public_id, created_at, updated_at, key, name, description, plan_type,
                   allowed_start_days)
VALUES ('pln_veg', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, 'veg',
        'Pure Vegetarian Plan', 'Seasonal vegetables, paneer, daal, rotis, raitas.', 'tiffin',
        ARRAY ['mon','tue','wed','thu','fri']),
       ('pln_halal_nonveg', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        'non-veg', 'Non-Veg Plan', 'Poultry, mutton, egg masalas, daals, chapatis.', 'tiffin',
        ARRAY ['mon','tue','wed','thu','fri'])
ON CONFLICT (key) DO NOTHING;

-- ============ MEAL SIZES ============ (17 sizes, read verbatim off the tiffingrab.ca pricing
-- plan sheet — docs/tiffingrab pricing image — not invented: 9 thalis × veg/non-veg, except
-- Small Thali which the sheet marks Veg Only. Pricing/composition/names below are the sheet's,
-- replacing the old placeholder catalog ("New Plan", trial sizes, etc.) that had drifted from
-- it. kcal per tier: budget 450-650, medium 650-900, premium 900-1300 (unchanged convention,
-- the sheet gives no macros). trial=false everywhere — the sheet has no trial meal.
-- plan_id resolves each size to its owning plan by key (veg-diet→veg, nonveg-diet→non-veg).
INSERT INTO meal_sizes (public_id, created_at, updated_at, key, name, plan_id, tier, trial, components, kcal_min, kcal_max,
                        protein_g, carbs_g, fat_g, base_price)
SELECT v.public_id,
       (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
       (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
       v.key, v.name,
       (SELECT id FROM plans WHERE key = v.plan_key),
       v.tier::meal_tier, FALSE, '[]'::jsonb,
       v.kcal_min, v.kcal_max, NULL, NULL, NULL, v.base_price
FROM (VALUES
  -- Budget
  ('msz_small_thali', 'small_thali', 'Small Thali', 'veg', 'budget', 450, 650, 9.00),
  ('msz_sabzi_only_regular_veg', 'sabzi_only_regular_veg', 'Sabzi Only — Regular', 'veg', 'budget', 450, 650, 9.00),
  ('msz_sabzi_only_regular_nonveg', 'sabzi_only_regular_nonveg', 'Sabzi Only — Regular', 'non-veg', 'budget', 450, 650, 10.00),
  ('msz_sabzi_only_large_veg', 'sabzi_only_large_veg', 'Sabzi Only — Large', 'veg', 'budget', 450, 650, 10.50),
  ('msz_sabzi_only_large_nonveg', 'sabzi_only_large_nonveg', 'Sabzi Only — Large', 'non-veg', 'budget', 450, 650, 11.50),
  -- Medium
  ('msz_item4_regular_veg', 'item4_regular_veg', '4 Item Thali — Regular', 'veg', 'medium', 650, 900, 10.00),
  ('msz_item4_regular_nonveg', 'item4_regular_nonveg', '4 Item Thali — Regular', 'non-veg', 'medium', 650, 900, 11.00),
  ('msz_item4_large_veg', 'item4_large_veg', '4 Item Thali — Large', 'veg', 'medium', 650, 900, 11.50),
  ('msz_item4_large_nonveg', 'item4_large_nonveg', '4 Item Thali — Large', 'non-veg', 'medium', 650, 900, 12.50),
  ('msz_item5_regular_veg', 'item5_regular_veg', '5 Item Thali — Regular', 'veg', 'medium', 650, 900, 11.00),
  ('msz_item5_regular_nonveg', 'item5_regular_nonveg', '5 Item Thali — Regular', 'non-veg', 'medium', 650, 900, 12.00),
  ('msz_new_thali_veg', 'new_thali_veg', 'New Thali Plan — Regular', 'veg', 'medium', 650, 900, 11.50),
  ('msz_new_thali_nonveg', 'new_thali_nonveg', 'New Thali Plan — Regular', 'non-veg', 'medium', 650, 900, 12.50),
  -- Premium
  ('msz_item5_large_veg', 'item5_large_veg', '5 Item Thali — Large', 'veg', 'premium', 900, 1300, 13.00),
  ('msz_item5_large_nonveg', 'item5_large_nonveg', '5 Item Thali — Large', 'non-veg', 'premium', 900, 1300, 14.00),
  ('msz_maharaja_veg', 'maharaja_veg', 'Maharaja Thali', 'veg', 'premium', 900, 1300, 14.00),
  ('msz_maharaja_nonveg', 'maharaja_nonveg', 'Maharaja Thali', 'non-veg', 'premium', 900, 1300, 14.75)
) AS v(public_id, key, name, plan_key, tier, kcal_min, kcal_max, base_price)
ON CONFLICT (key) DO NOTHING;

-- ============ MEAL SIZE ITEMS ============ (FK by meal_sizes.key subquery; no unique key -> wipe+reinsert
-- like pricing_tiers. TU (tiffin unit) is the shared currency swaps move between categories —
-- see db/schema/menu.ts. Weighed categories default 8oz/TU (12oz -> 1.5 TU); roti is 4 pieces/TU,
-- so "2 roti" is 2 rows at 0.25 TU each (a row IS one dish pick, there's no qty column);
-- rice has no weight, 1 unit/TU, 1 row per pick.
-- meal_size_id is NOT NULL so a mistyped meal_size_key fails the insert loudly instead of orphaning a row.)
DELETE FROM meal_size_items WHERE id > 0;
-- item_plan_key overrides the item's own plan when it differs from the meal
-- size's own plan (NULL = inherit the meal size's plan, the common case). A
-- non-veg meal size with 2+ Sabzi rows keeps only its largest-tuAmount row as
-- non-veg and retags the rest veg — one non-veg meal can then offer both a
-- meat-adjacent sabzi and a veg sabzi, per reachablePlanIdsForMealSize in
-- dish-categories.service.ts, which is what makes a veg-scoped dish or swap
-- rule reachable from a non-veg order. A veg meal size never gets a
-- non-veg-tagged row, so this stays one-directional by construction.
INSERT INTO meal_size_items
  (public_id, created_at, updated_at, meal_size_id, name, category, plan_id, tu_amount, max_tu_amount, sort_order)
SELECT 'msi_' || SUBSTR(MD5(v.meal_size_key || v.name || v.sort_order::TEXT), 1, 10),
       (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
       (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
       (SELECT id FROM meal_sizes WHERE key = v.meal_size_key),
       -- category is a soft ref to dish_categories.key; map each real item name to its key.
       v.name,
       CASE v.name
         WHEN 'Sabzi' THEN 'sabzi'
         WHEN 'Daal' THEN 'daal'
         WHEN 'Rice' THEN 'rice'
         WHEN 'Roti' THEN 'roti'
         WHEN 'Salad' THEN 'salad'
         WHEN 'Raita' THEN 'raita'
       END,
       COALESCE((SELECT id FROM plans WHERE key = v.item_plan_key), (SELECT plan_id FROM meal_sizes WHERE key = v.meal_size_key)),
       v.tu_amount, v.max_tu_amount, v.sort_order
FROM (VALUES
  -- Small Thali: 1×12oz Sabzi + Rice + 2 Rotis
  ('small_thali', 'Sabzi', 1.5, NULL, 0, NULL),
  ('small_thali', 'Rice', 1, NULL, 1, NULL),
  ('small_thali', 'Roti', 0.25, NULL, 2, NULL),
  ('small_thali', 'Roti', 0.25, NULL, 3, NULL),
  -- Sabzi Only — Regular: 2 Sabzi(8oz) + 1 Daal(8oz)
  ('sabzi_only_regular_veg', 'Sabzi', 1, NULL, 0, NULL),
  ('sabzi_only_regular_veg', 'Sabzi', 1, NULL, 1, NULL),
  ('sabzi_only_regular_veg', 'Daal', 1, NULL, 2, NULL),
  -- Equal-weight (1, 1) Sabzi pair: first stays non-veg, second retags veg.
  ('sabzi_only_regular_nonveg', 'Sabzi', 1, NULL, 0, 'non-veg'),
  ('sabzi_only_regular_nonveg', 'Sabzi', 1, NULL, 1, 'veg'),
  ('sabzi_only_regular_nonveg', 'Daal', 1, NULL, 2, 'veg'),
  -- Sabzi Only — Large: 2 Sabzi(12oz) + 1 Sabzi(8oz) — no Daal, per the sheet
  ('sabzi_only_large_veg', 'Sabzi', 1.5, NULL, 0, NULL),
  ('sabzi_only_large_veg', 'Sabzi', 1.5, NULL, 1, NULL),
  ('sabzi_only_large_veg', 'Sabzi', 1, NULL, 2, NULL),
  -- Only the single largest (1.5, sort_order 0) stays non-veg; the other two retag veg.
  ('sabzi_only_large_nonveg', 'Sabzi', 1.5, NULL, 0, 'non-veg'),
  ('sabzi_only_large_nonveg', 'Sabzi', 1.5, NULL, 1, 'veg'),
  ('sabzi_only_large_nonveg', 'Sabzi', 1, NULL, 2, 'veg'),
  -- 4 Item Thali — Regular: 1 Sabzi(8oz) + 1 Daal(8oz) + Rice + 2 Rotis
  ('item4_regular_veg', 'Sabzi', 1, NULL, 0, NULL),
  ('item4_regular_veg', 'Daal', 1, NULL, 1, NULL),
  ('item4_regular_veg', 'Rice', 1, NULL, 2, NULL),
  ('item4_regular_veg', 'Roti', 0.25, NULL, 3, NULL),
  ('item4_regular_veg', 'Roti', 0.25, NULL, 4, NULL),
  -- Only 1 Sabzi row — nothing to split, stays non-veg only.
  ('item4_regular_nonveg', 'Sabzi', 1, NULL, 0, NULL),
  ('item4_regular_nonveg', 'Daal', 1, NULL, 1, 'veg'),
  ('item4_regular_nonveg', 'Rice', 1, NULL, 2, 'veg'),
  ('item4_regular_nonveg', 'Roti', 0.25, NULL, 3, 'veg'),
  ('item4_regular_nonveg', 'Roti', 0.25, NULL, 4, 'veg'),
  -- 4 Item Thali — Large: 1 Sabzi(12oz) + 1 Daal(12oz) + Rice + 4 Rotis
  ('item4_large_veg', 'Sabzi', 1.5, NULL, 0, NULL),
  ('item4_large_veg', 'Daal', 1.5, NULL, 1, NULL),
  ('item4_large_veg', 'Rice', 1, NULL, 2, NULL),
  ('item4_large_veg', 'Roti', 0.25, NULL, 3, NULL),
  ('item4_large_veg', 'Roti', 0.25, NULL, 4, NULL),
  ('item4_large_veg', 'Roti', 0.25, NULL, 5, NULL),
  ('item4_large_veg', 'Roti', 0.25, NULL, 6, NULL),
  -- Only 1 Sabzi row — nothing to split, stays non-veg only.
  ('item4_large_nonveg', 'Sabzi', 1.5, NULL, 0, NULL),
  ('item4_large_nonveg', 'Daal', 1.5, NULL, 1, 'veg'),
  ('item4_large_nonveg', 'Rice', 1, NULL, 2, 'veg'),
  ('item4_large_nonveg', 'Roti', 0.25, NULL, 3, 'veg'),
  ('item4_large_nonveg', 'Roti', 0.25, NULL, 4, 'veg'),
  ('item4_large_nonveg', 'Roti', 0.25, NULL, 5, 'veg'),
  ('item4_large_nonveg', 'Roti', 0.25, NULL, 6, 'veg'),
  -- 5 Item Thali — Regular: 2 Sabzi(8oz) + 1 Daal(8oz)/Salad/Raita + Rice + 3 Rotis.
  -- The "/Salad/Raita" alternative is the existing daal<->salad / daal<->raita swap
  -- pairs below, not a separate composition row — the sheet's base is Daal.
  ('item5_regular_veg', 'Sabzi', 1, NULL, 0, NULL),
  ('item5_regular_veg', 'Sabzi', 1, NULL, 1, NULL),
  ('item5_regular_veg', 'Daal', 1, NULL, 2, NULL),
  ('item5_regular_veg', 'Rice', 1, NULL, 3, NULL),
  ('item5_regular_veg', 'Roti', 0.25, NULL, 4, NULL),
  ('item5_regular_veg', 'Roti', 0.25, NULL, 5, NULL),
  ('item5_regular_veg', 'Roti', 0.25, NULL, 6, NULL),
  -- Equal-weight (1, 1) Sabzi pair: first stays non-veg, second retags veg.
  ('item5_regular_nonveg', 'Sabzi', 1, NULL, 0, 'non-veg'),
  ('item5_regular_nonveg', 'Sabzi', 1, NULL, 1, 'veg'),
  ('item5_regular_nonveg', 'Daal', 1, NULL, 2, 'veg'),
  ('item5_regular_nonveg', 'Rice', 1, NULL, 3, 'veg'),
  ('item5_regular_nonveg', 'Roti', 0.25, NULL, 4, 'veg'),
  ('item5_regular_nonveg', 'Roti', 0.25, NULL, 5, 'veg'),
  ('item5_regular_nonveg', 'Roti', 0.25, NULL, 6, 'veg'),
  -- New Thali Plan — Regular: 1 Sabzi(8oz) + 1 Daal(8oz) + 8 Rotis — no rice
  ('new_thali_veg', 'Sabzi', 1, NULL, 0, NULL),
  ('new_thali_veg', 'Daal', 1, NULL, 1, NULL),
  ('new_thali_veg', 'Roti', 0.25, NULL, 2, NULL),
  ('new_thali_veg', 'Roti', 0.25, NULL, 3, NULL),
  ('new_thali_veg', 'Roti', 0.25, NULL, 4, NULL),
  ('new_thali_veg', 'Roti', 0.25, NULL, 5, NULL),
  ('new_thali_veg', 'Roti', 0.25, NULL, 6, NULL),
  ('new_thali_veg', 'Roti', 0.25, NULL, 7, NULL),
  ('new_thali_veg', 'Roti', 0.25, NULL, 8, NULL),
  ('new_thali_veg', 'Roti', 0.25, NULL, 9, NULL),
  -- Only 1 Sabzi row — nothing to split, stays non-veg only.
  ('new_thali_nonveg', 'Sabzi', 1, NULL, 0, NULL),
  ('new_thali_nonveg', 'Daal', 1, NULL, 1, 'veg'),
  ('new_thali_nonveg', 'Roti', 0.25, NULL, 2, 'veg'),
  ('new_thali_nonveg', 'Roti', 0.25, NULL, 3, 'veg'),
  ('new_thali_nonveg', 'Roti', 0.25, NULL, 4, 'veg'),
  ('new_thali_nonveg', 'Roti', 0.25, NULL, 5, 'veg'),
  ('new_thali_nonveg', 'Roti', 0.25, NULL, 6, 'veg'),
  ('new_thali_nonveg', 'Roti', 0.25, NULL, 7, 'veg'),
  ('new_thali_nonveg', 'Roti', 0.25, NULL, 8, 'veg'),
  ('new_thali_nonveg', 'Roti', 0.25, NULL, 9, 'veg'),
  -- 5 Item Thali — Large: 1 Sabzi(12oz) + 1 Daal(12oz) + 1 Sabzi(8oz)/Salad/Raita + Rice + 6 Rotis
  ('item5_large_veg', 'Sabzi', 1.5, NULL, 0, NULL),
  ('item5_large_veg', 'Daal', 1.5, NULL, 1, NULL),
  ('item5_large_veg', 'Sabzi', 1, NULL, 2, NULL),
  ('item5_large_veg', 'Rice', 1, NULL, 3, NULL),
  ('item5_large_veg', 'Roti', 0.25, NULL, 4, NULL),
  ('item5_large_veg', 'Roti', 0.25, NULL, 5, NULL),
  ('item5_large_veg', 'Roti', 0.25, NULL, 6, NULL),
  ('item5_large_veg', 'Roti', 0.25, NULL, 7, NULL),
  ('item5_large_veg', 'Roti', 0.25, NULL, 8, NULL),
  ('item5_large_veg', 'Roti', 0.25, NULL, 9, NULL),
  -- Larger Sabzi (1.5, sort_order 0) stays non-veg; smaller (1, sort_order 2) retags veg.
  ('item5_large_nonveg', 'Sabzi', 1.5, NULL, 0, 'non-veg'),
  ('item5_large_nonveg', 'Daal', 1.5, NULL, 1, 'veg'),
  ('item5_large_nonveg', 'Sabzi', 1, NULL, 2, 'veg'),
  ('item5_large_nonveg', 'Rice', 1, NULL, 3, 'veg'),
  ('item5_large_nonveg', 'Roti', 0.25, NULL, 4, 'veg'),
  ('item5_large_nonveg', 'Roti', 0.25, NULL, 5, 'veg'),
  ('item5_large_nonveg', 'Roti', 0.25, NULL, 6, 'veg'),
  ('item5_large_nonveg', 'Roti', 0.25, NULL, 7, 'veg'),
  ('item5_large_nonveg', 'Roti', 0.25, NULL, 8, 'veg'),
  ('item5_large_nonveg', 'Roti', 0.25, NULL, 9, 'veg'),
  -- Maharaja Thali: 1 Sabzi(12oz) + 1 Daal(12oz) + 1 Sabzi(8oz) + Salad + Raita + Rice + 8 Rotis
  ('maharaja_veg', 'Sabzi', 1.5, NULL, 0, NULL),
  ('maharaja_veg', 'Daal', 1.5, NULL, 1, NULL),
  ('maharaja_veg', 'Sabzi', 1, NULL, 2, NULL),
  ('maharaja_veg', 'Salad', 1, 2, 3, NULL),
  ('maharaja_veg', 'Raita', 1, 2, 4, NULL),
  ('maharaja_veg', 'Rice', 1, NULL, 5, NULL),
  ('maharaja_veg', 'Roti', 0.25, NULL, 6, NULL),
  ('maharaja_veg', 'Roti', 0.25, NULL, 7, NULL),
  ('maharaja_veg', 'Roti', 0.25, NULL, 8, NULL),
  ('maharaja_veg', 'Roti', 0.25, NULL, 9, NULL),
  ('maharaja_veg', 'Roti', 0.25, NULL, 10, NULL),
  ('maharaja_veg', 'Roti', 0.25, NULL, 11, NULL),
  ('maharaja_veg', 'Roti', 0.25, NULL, 12, NULL),
  ('maharaja_veg', 'Roti', 0.25, NULL, 13, NULL),
  -- Larger Sabzi (1.5, sort_order 0) stays non-veg; smaller (1, sort_order 2) retags veg.
  ('maharaja_nonveg', 'Sabzi', 1.5, NULL, 0, 'non-veg'),
  ('maharaja_nonveg', 'Daal', 1.5, NULL, 1, 'veg'),
  ('maharaja_nonveg', 'Sabzi', 1, NULL, 2, 'veg'),
  ('maharaja_nonveg', 'Salad', 1, 2, 3, 'veg'),
  ('maharaja_nonveg', 'Raita', 1, 2, 4, 'veg'),
  ('maharaja_nonveg', 'Rice', 1, NULL, 5, 'veg'),
  ('maharaja_nonveg', 'Roti', 0.25, NULL, 6, 'veg'),
  ('maharaja_nonveg', 'Roti', 0.25, NULL, 7, 'veg'),
  ('maharaja_nonveg', 'Roti', 0.25, NULL, 8, 'veg'),
  ('maharaja_nonveg', 'Roti', 0.25, NULL, 9, 'veg'),
  ('maharaja_nonveg', 'Roti', 0.25, NULL, 10, 'veg'),
  ('maharaja_nonveg', 'Roti', 0.25, NULL, 11, 'veg'),
  ('maharaja_nonveg', 'Roti', 0.25, NULL, 12, 'veg'),
  ('maharaja_nonveg', 'Roti', 0.25, NULL, 13, 'veg')
) AS v(meal_size_key, name, tu_amount, max_tu_amount, sort_order, item_plan_key);

-- Derive human-readable components[] from the structured items (single source of truth).
-- Runs unconditionally: the meal_sizes INSERT above uses ON CONFLICT DO NOTHING and seeds
-- components='[]', so only this UPDATE populates it (and refreshes it on every reseed).
UPDATE meal_sizes ms SET components = COALESCE((
  SELECT json_agg(g.cnt || '× ' || g.name ORDER BY g.min_sort)
  FROM (
    SELECT name, COUNT(*) AS cnt, MIN(sort_order) AS min_sort
    FROM meal_size_items WHERE meal_size_id = ms.id
    GROUP BY name
  ) g
), '[]'::json)::jsonb
WHERE ms.id > 0;

-- ============ DELIVERY FREQUENCIES ============
INSERT INTO delivery_frequencies (public_id, created_at, updated_at, key, name, days_per_week, courier_discount_pct, weekdays)
VALUES ('frq_5_day', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, '5_day',
        '5 Days/Wk (Mon–Fri)', 5, 0, ARRAY['mon','tue','wed','thu','fri']),
       ('frq_mwf', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, 'mwf',
        '3 Days/Wk Alternate (MWF)', 3, 10, ARRAY['mon','wed','fri'])
ON CONFLICT (key) DO UPDATE SET weekdays = EXCLUDED.weekdays;

-- ============ DURATION PACKAGES ============
INSERT INTO duration_packages (public_id, created_at, updated_at, weeks, discount_pct)
VALUES ('dur_w1', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, 1, 0),
       ('dur_w2', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, 2, 0),
       ('dur_w4', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, 4, 0),
       ('dur_w8', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, 8, 0),
       ('dur_w12', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, 12, 0)
ON CONFLICT (weeks) DO NOTHING;

-- ============ CENTRAL DISCOUNTS ============
INSERT INTO discounts (public_id, created_at, updated_at, key, name, kind, target_id, percent)
SELECT 'dsc_' || replace(gen_random_uuid()::text, '-', ''), (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
       'delivery_' || f.key, 'Delivery schedule discount - ' || f.name, 'delivery', f.id, f.courier_discount_pct
FROM delivery_frequencies f WHERE f.courier_discount_pct > 0
ON CONFLICT (key) DO NOTHING;
INSERT INTO discounts (public_id, created_at, updated_at, key, name, kind, target_id, percent)
SELECT 'dsc_' || replace(gen_random_uuid()::text, '-', ''), (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
       'duration_' || d.weeks || 'w', 'Plan length discount - ' || d.weeks || ' weeks', 'duration', d.id, d.discount_pct
FROM duration_packages d WHERE d.discount_pct > 0
ON CONFLICT (key) DO NOTHING;

-- ============ DELIVERY ZONES ============
INSERT INTO delivery_zones (public_id, created_at, updated_at, name, postal_prefixes, slot_window)
VALUES ('zon_etobicoke', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        'Etobicoke', ARRAY ['M8','M9'], '9:00 AM – 12:00 PM'),
       ('zon_mississauga', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        'Mississauga', ARRAY ['L5'], '10:00 AM – 1:00 PM'),
       ('zon_brampton', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        'Brampton', ARRAY ['L6P','L6R','L6S','L6T','L6V','L6W','L6X','L6Y','L6Z','L7A'], '11:00 AM – 2:00 PM'),
       ('zon_toronto', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        'Toronto', ARRAY ['M4','M5','M6'], '10:00 AM – 1:00 PM'),
       ('zon_scarborough', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        'Scarborough', ARRAY ['M1'], '12:00 PM – 3:00 PM'),
       ('zon_markham', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        'Markham', ARRAY ['L3R','L3S','L3P','L6B','L6C','L6E','L6G'], '11:00 AM – 2:00 PM'),
       ('zon_richmond_hill', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        'Richmond Hill', ARRAY ['L4B','L4C','L4E','L4S'], '11:00 AM – 2:00 PM'),
       ('zon_north_york', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        'North York', ARRAY ['M2','M3'], '10:00 AM – 1:00 PM'),
       ('zon_vaughan', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        'Vaughan', ARRAY ['L4H','L4J','L4K','L4L','L6A'], '11:00 AM – 2:00 PM'),
       ('zon_oakville', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        'Oakville', ARRAY ['L6H','L6J','L6K','L6L','L6M'], '12:00 PM – 3:00 PM'),
       ('zon_east_york', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        'East York', ARRAY ['M4B','M4C','M4G','M4H','M4J','M4K'], '10:00 AM – 1:00 PM')
ON CONFLICT (name) DO NOTHING;

-- ============ PRICING TIERS ============ (no unique key -> wipe + reinsert, matches seed)
DELETE FROM pricing_tiers WHERE id > 0;
INSERT INTO pricing_tiers (public_id, created_at, updated_at, min_qty, max_qty, uplift_pct)
VALUES ('ptr_1', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, 1, 11, 20.00),
       ('ptr_2', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, 12, 19, 10.00),
       ('ptr_3', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, 20, NULL,
        0.00);

-- ============ FEATURE FLAGS ============
INSERT INTO feature_flags (public_id, created_at, updated_at, key, label, description, default_enabled)
VALUES ('flg_subscription_wizard', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, 'subscription_wizard', 'Subscription Wizard',
        'Access the plan builder', TRUE),
       ('flg_admin_console', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        'admin_console', 'Admin Console', 'User & flag administration', FALSE),
       ('flg_reassign_records', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, 'reassign_records', 'Reassign records',
        'Reassign orders, inquiries, and tickets to other staff', FALSE)
ON CONFLICT (key) DO NOTHING;

-- ============ APP SETTINGS ============ seeded at the top (tenant singleton).

-- ============ WALLET: EVENT PAYOUTS ============ (one row per app_event enum value)
INSERT INTO event_payout (public_id, created_at, updated_at, event_type, enabled, coins)
SELECT 'evp_' || ev::TEXT,
       (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
       (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
       ev,
       FALSE,
       0
FROM UNNEST(ENUM_RANGE(NULL::app_event)) AS ev
ON CONFLICT (event_type) DO NOTHING;

-- ============ WALLET: COIN RATE ============ (no unique key -> guard with NOT EXISTS per currency)
INSERT INTO coin_rate (public_id, created_at, currency, value_per_coin)
SELECT 'cnr_cad_default', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, 'CAD', 0.1000
WHERE NOT EXISTS (SELECT 1 FROM coin_rate WHERE currency = 'CAD');

-- ============ WALLET: MEAL PAYOUTS ============ (default/catch-all row: NULL meal_size_id +
-- NULL duration_package_id. Postgres treats NULL as distinct in a unique index, so
-- meal_payout_combo_unique can't gate this insert -> guard with NOT EXISTS, same as coin_rate.)
INSERT INTO meal_payout (public_id, created_at, updated_at, meal_size_id, duration_package_id, coins)
SELECT 'mlp_default', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
       NULL, NULL, 0
WHERE NOT EXISTS (SELECT 1 FROM meal_payout WHERE meal_size_id IS NULL AND duration_package_id IS NULL);

-- ============ MENU: DISH CATEGORIES ============
INSERT INTO dish_categories (public_id, created_at, updated_at, key, label, enabled, selectable,
                             sort_order, tu_unit_type, tu_unit_size, tu_unit_label)
VALUES ('slt_tiffin_sabzi', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        'sabzi', 'Sabzi', TRUE, TRUE, 1, 'weight', 8, 'oz'),
       ('slt_tiffin_rice', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        'rice', 'Rice', TRUE, FALSE, 2, 'count', 1, 'unit'),
       ('slt_tiffin_roti', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        'roti', 'Roti', TRUE, FALSE, 3, 'count', 4, 'roti'),
       ('slt_tiffin_raita', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        'raita', 'Raita', TRUE, FALSE, 4, 'weight', 8, 'oz'),
       ('slt_tiffin_salad', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        'salad', 'Salad', TRUE, FALSE, 5, 'weight', 8, 'oz'),
       ('slt_tiffin_daal', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        'daal', 'Daal', TRUE, FALSE, 6, 'weight', 8, 'oz'),
       -- 'curry' is gone: it was a second slot for the same gravy dish Sabzi already
       -- covers (a non-veg thali's "Curry" item and a veg thali's "Sabzi" item are the
       -- same slot, split only by dish.dietType) — two categories for one dish concept
       -- was the confusion the plan pricing image doesn't have, so it's merged into 'sabzi'.
       -- No meal_size_items reference 'extra' any more (the TU redesign dropped the
       -- veg-curry Extra slot from every meal size), but Egg Bhurji/Masala Papad below
       -- still carry it as their dishes.category soft-ref — keep the row so that FK isn't
       -- orphaned, harmless since nothing composes a meal with it.
       ('slt_tiffin_extra', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        'extra', 'Extra', TRUE, FALSE, 8, 'weight', 8, 'oz')
ON CONFLICT (key) DO NOTHING;

-- ============ CATEGORY -> PLANS ============
-- Which plans each slot belongs to. Tiffin slots go to both tiffin plans (a
-- non-veg thali still has sabzi/daal/roti).
INSERT INTO category_plans (public_id, created_at, updated_at, category_id, plan_id)
SELECT 'cpl_' || SUBSTR(MD5(v.cat_key || v.plan_key), 1, 10),
       (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
       (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
       (SELECT id FROM dish_categories WHERE key = v.cat_key),
       (SELECT id FROM plans WHERE key = v.plan_key)
FROM (VALUES
  ('sabzi','veg'),('sabzi','non-veg'),
  ('rice','veg'),('rice','non-veg'),
  ('roti','veg'),('roti','non-veg'),
  ('raita','veg'),('raita','non-veg'),
  ('daal','veg'),('daal','non-veg'),
  ('extra','veg'),('extra','non-veg'),
  ('salad','veg'),('salad','non-veg')
) AS v(cat_key, plan_key)
WHERE NOT EXISTS (
  SELECT 1 FROM category_plans cp
  WHERE cp.category_id = (SELECT id FROM dish_categories WHERE key = v.cat_key)
    AND cp.plan_id = (SELECT id FROM plans WHERE key = v.plan_key)
);

-- ============ CATEGORY SWAP PAIRS ============ (global eligibility, not scoped to a meal
-- size — see db/schema/menu.ts. Trade is always flat 1 TU-for-1 TU now, computed at apply
-- time from each category's own tuAmount, so this only records WHICH pairs may ever swap:
-- daal<->sabzi (the maharaja gravy pool, formerly daal<->curry before 'curry' merged into
-- 'sabzi'), salad->raita, roti<->rice.
--
-- salad->raita is deliberately ONE-DIRECTIONAL, not the salad<->raita pair it used to be:
-- the base composition is Salad, so raita->salad has no salad to reach it from and would
-- be dead. This is also what keeps the two exclusive — a customer can stack up to
-- maxTuAmount(=2) raita via repeated salad->raita swaps, but can never ALSO hold salad,
-- since there is no pair that ever moves TU back out of raita.
-- plan_id is null (applies to every plan): every pair below holds identically
-- on veg and non-veg, so one row each — not the two-rows-per-plan duplication
-- pattern dishes uses, since these rules aren't diet-specific like a dish is.
-- An admin can still narrow one to a single plan later via the swaps page.
DELETE FROM category_swap_pairs WHERE id > 0;
INSERT INTO category_swap_pairs (public_id, created_at, updated_at, from_category_id, to_category_id, plan_id)
SELECT 'csp_' || SUBSTR(MD5(v.from_key || v.to_key), 1, 10),
       (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
       (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
       (SELECT id FROM dish_categories WHERE key = v.from_key),
       (SELECT id FROM dish_categories WHERE key = v.to_key),
       NULL
FROM (VALUES
  ('daal', 'sabzi'), ('sabzi', 'daal'),
  -- 5 Item Thali's "Daal/Salad/Raita" slot on the pricing sheet: the base
  -- composition is Daal, salad and raita are the documented alternatives.
  ('daal', 'salad'), ('daal', 'raita'),
  ('salad', 'raita'),
  ('roti', 'rice'), ('rice', 'roti')
) AS v(from_key, to_key);

-- ============ CURRY -> SABZI MERGE ============ (repoints any already-seeded rows from a
-- prior run before the category itself is retired below — a plain re-seed of the categories
-- above only inserts 'sabzi' going forward, it can't fix rows an earlier seed already wrote
-- against 'curry'.)
UPDATE dishes SET category = 'sabzi' WHERE category = 'curry';
UPDATE meal_size_items SET category = 'sabzi' WHERE category = 'curry';
UPDATE category_swap_pairs SET from_category_id = (SELECT id FROM dish_categories WHERE key = 'sabzi')
  WHERE from_category_id = (SELECT id FROM dish_categories WHERE key = 'curry');
UPDATE category_swap_pairs SET to_category_id = (SELECT id FROM dish_categories WHERE key = 'sabzi')
  WHERE to_category_id = (SELECT id FROM dish_categories WHERE key = 'curry');
DELETE FROM category_plans WHERE category_id = (SELECT id FROM dish_categories WHERE key = 'curry');
DELETE FROM dish_categories WHERE key = 'curry';

-- ============ MENU: DISHES ============ (unique on (name, plan_id) now — a dish
-- belongs to exactly one plan, so a dish shared across veg and non-veg thalis
-- (e.g. Dal Tadka) is TWO rows here, one per plan, not one row with two
-- dish_plans memberships. public_id carries the plan suffix to keep both unique.
-- Real business menu, imported from docs/Menu_Unique_Items.xlsx (Veg/Dal/Non-Veg
-- sheets). Every name is globally unique on its own (no shared dish needed a
-- plan suffix this time), one row per (name), one plan each. Dal items are
-- veg-only (no dal dish is ever non-veg) — non-veg orders reach them through
-- the Daal composition row being retagged veg below, same mechanism the
-- Sabzi split uses. A handful of items classified 'extra' (Kulcha, Pao Bhaji,
-- Noodles, Pasta) have no meal_size_items row targeting 'extra' yet, so they
-- are seeded but not yet reachable from any meal size's composition — add a
-- composition row referencing 'extra' when ready to surface them.
INSERT INTO dishes (public_id, created_at, updated_at, name, description, category, plan_id)
SELECT v.public_id,
       (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
       (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
       v.name,
       v.description,
       v.category,
       (SELECT id FROM plans WHERE key = v.plan_key)
FROM (VALUES
  ('dsh_achari_paneer', 'Achari Paneer', NULL, 'sabzi', 'veg'),
  ('dsh_aloo_beans', 'Aloo Beans', NULL, 'sabzi', 'veg'),
  ('dsh_aloo_dahiwale', 'Aloo Dahiwale', NULL, 'sabzi', 'veg'),
  ('dsh_aloo_jeera', 'Aloo Jeera', NULL, 'sabzi', 'veg'),
  ('dsh_aloo_matar', 'Aloo Matar', NULL, 'sabzi', 'veg'),
  ('dsh_aloo_methi', 'Aloo Methi', NULL, 'sabzi', 'veg'),
  ('dsh_aloo_palak', 'Aloo Palak', NULL, 'sabzi', 'veg'),
  ('dsh_aloo_soya_vadi', 'Aloo Soya Vadi', NULL, 'sabzi', 'veg'),
  ('dsh_aloo_zeera', 'Aloo Zeera', NULL, 'sabzi', 'veg'),
  ('dsh_aloo_with_kulcha', 'Aloo with Kulcha', NULL, 'extra', 'veg'),
  ('dsh_baigan_aloo', 'Baigan Aloo', NULL, 'sabzi', 'veg'),
  ('dsh_baingan_aloo_salan', 'Baingan Aloo Salan', NULL, 'sabzi', 'veg'),
  ('dsh_baingan_bhartha', 'Baingan Bhartha', NULL, 'sabzi', 'veg'),
  ('dsh_baingan_patiala', 'Baingan Patiala', NULL, 'sabzi', 'veg'),
  ('dsh_bhartha', 'Bhartha', NULL, 'sabzi', 'veg'),
  ('dsh_bhartha_matar', 'Bhartha Matar', NULL, 'sabzi', 'veg'),
  ('dsh_bhindi', 'Bhindi', NULL, 'sabzi', 'veg'),
  ('dsh_bhindi_aloo', 'Bhindi Aloo', NULL, 'sabzi', 'veg'),
  ('dsh_bhindi_do_piyaza', 'Bhindi Do Piyaza', NULL, 'sabzi', 'veg'),
  ('dsh_bhindi_masala', 'Bhindi Masala', NULL, 'sabzi', 'veg'),
  ('dsh_cabbage', 'Cabbage', NULL, 'sabzi', 'veg'),
  ('dsh_cabbage_matar', 'Cabbage Matar', NULL, 'sabzi', 'veg'),
  ('dsh_chana_kulcha', 'Chana Kulcha', NULL, 'extra', 'veg'),
  ('dsh_chicken_biryani', 'Chicken Biryani', NULL, 'rice', 'non-veg'),
  ('dsh_chicken_fried_rice', 'Chicken Fried Rice', NULL, 'rice', 'non-veg'),
  ('dsh_chicken_keema_pulao', 'Chicken Keema Pulao', NULL, 'rice', 'non-veg'),
  ('dsh_dahi_wale_aloo', 'Dahi Wale Aloo', NULL, 'sabzi', 'veg'),
  ('dsh_gajar_aloo', 'Gajar Aloo', NULL, 'sabzi', 'veg'),
  ('dsh_gajar_matar', 'Gajar Matar', NULL, 'sabzi', 'veg'),
  ('dsh_gobhi', 'Gobhi', NULL, 'sabzi', 'veg'),
  ('dsh_gobhi_aloo', 'Gobhi Aloo', NULL, 'sabzi', 'veg'),
  ('dsh_gobhi_matar', 'Gobhi Matar', NULL, 'sabzi', 'veg'),
  ('dsh_kadai_paneer', 'Kadai Paneer', NULL, 'sabzi', 'veg'),
  ('dsh_kala_chana_biryani', 'Kala Chana Biryani', NULL, 'rice', 'veg'),
  ('dsh_kashmiri_dum_aloo', 'Kashmiri Dum Aloo', NULL, 'sabzi', 'veg'),
  ('dsh_kulcha_aloo_bhaji', 'Kulcha, Aloo Bhaji', NULL, 'extra', 'veg'),
  ('dsh_lauki_chanadal', 'Lauki Chanadal', NULL, 'sabzi', 'veg'),
  ('dsh_lauki_kofta', 'Lauki Kofta', NULL, 'sabzi', 'veg'),
  ('dsh_matar_paneer', 'Matar Paneer', NULL, 'sabzi', 'veg'),
  ('dsh_methi_aloo_kashmiri', 'Methi Aloo Kashmiri', NULL, 'sabzi', 'veg'),
  ('dsh_mixed_veg', 'Mixed Veg', NULL, 'sabzi', 'veg'),
  ('dsh_mixed_vegs', 'Mixed vegs', NULL, 'sabzi', 'veg'),
  ('dsh_okra', 'Okra', NULL, 'sabzi', 'veg'),
  ('dsh_palak_paneer', 'Palak Paneer', NULL, 'sabzi', 'veg'),
  ('dsh_paneer_veg_pulao', 'Paneer & Veg Pulao', NULL, 'rice', 'veg'),
  ('dsh_paneer_korma', 'Paneer Korma', NULL, 'sabzi', 'veg'),
  ('dsh_paneer_makhani', 'Paneer Makhani', NULL, 'sabzi', 'veg'),
  ('dsh_paneer_masala', 'Paneer Masala', NULL, 'sabzi', 'veg'),
  ('dsh_paneer_tikka_masala', 'Paneer Tikka Masala', NULL, 'sabzi', 'veg'),
  ('dsh_pao_bhaji', 'Pao Bhaji', NULL, 'extra', 'veg'),
  ('dsh_pao_keema', 'Pao Keema', NULL, 'extra', 'non-veg'),
  ('dsh_pao_keema_matar', 'Pao Keema Matar', NULL, 'extra', 'non-veg'),
  ('dsh_patta_gobhi_matar', 'Patta Gobhi Matar', NULL, 'sabzi', 'veg'),
  ('dsh_patta_gobhi', 'Patta gobhi', NULL, 'sabzi', 'veg'),
  ('dsh_pepper_aloo_masala', 'Pepper Aloo Masala', NULL, 'sabzi', 'veg'),
  ('dsh_saag', 'Saag', NULL, 'sabzi', 'veg'),
  ('dsh_shimla_mirch_paneer', 'Shimla Mirch Paneer', NULL, 'sabzi', 'veg'),
  ('dsh_soya_chaap', 'Soya Chaap', NULL, 'sabzi', 'veg'),
  ('dsh_soya_keema', 'Soya Keema', NULL, 'sabzi', 'veg'),
  ('dsh_soya_vadi', 'Soya Vadi', NULL, 'sabzi', 'veg'),
  ('dsh_spicy_paneer', 'Spicy Paneer', NULL, 'sabzi', 'veg'),
  ('dsh_veg_fried_rice', 'Veg Fried Rice', NULL, 'rice', 'veg'),
  ('dsh_veg_jalfrezi', 'Veg Jalfrezi', NULL, 'sabzi', 'veg'),
  ('dsh_veg_kofta_curry', 'Veg Kofta Curry', NULL, 'sabzi', 'veg'),
  ('dsh_veg_korma', 'Veg Korma', NULL, 'sabzi', 'veg'),
  ('dsh_veg_noodles', 'Veg Noodles', NULL, 'extra', 'veg'),
  ('dsh_veg_pasta', 'Veg Pasta', NULL, 'extra', 'veg'),
  ('dsh_vegetable_jalfrezi', 'Vegetable Jalfrezi', NULL, 'sabzi', 'veg'),
  ('dsh_zucchini', 'Zucchini', NULL, 'sabzi', 'veg'),
  ('dsh_chana', 'Chana', NULL, 'daal', 'veg'),
  ('dsh_chana_dal', 'Chana Dal', NULL, 'daal', 'veg'),
  ('dsh_chana_dal_palak', 'Chana Dal Palak', NULL, 'daal', 'veg'),
  ('dsh_chana_masala', 'Chana Masala', NULL, 'daal', 'veg'),
  ('dsh_chicken_keema_kulcha', 'Chicken Keema/Kulcha', NULL, 'extra', 'non-veg'),
  ('dsh_chicken_noodles', 'Chicken Noodles', NULL, 'extra', 'non-veg'),
  ('dsh_chicken_pulao', 'Chicken Pulao', NULL, 'rice', 'non-veg'),
  ('dsh_chicken_pasta', 'Chicken pasta', NULL, 'extra', 'non-veg'),
  ('dsh_chilli_chicken_steamed_rice', 'Chilli chicken/steamed rice', NULL, 'sabzi', 'non-veg'),
  ('dsh_dal_tadka', 'Dal Tadka', NULL, 'daal', 'veg'),
  ('dsh_kadi', 'Kadi', NULL, 'daal', 'veg'),
  ('dsh_kadi_pakora', 'Kadi Pakora', NULL, 'daal', 'veg'),
  ('dsh_kala_chana', 'Kala Chana', NULL, 'daal', 'veg'),
  ('dsh_kala_chana_masaledar', 'Kala Chana Masaledar', NULL, 'daal', 'veg'),
  ('dsh_kali_dal', 'Kali Dal', NULL, 'daal', 'veg'),
  ('dsh_keema_pao', 'Keema Pao', NULL, 'sabzi', 'non-veg'),
  ('dsh_lal_masoor_tadka', 'Lal Masoor Tadka', NULL, 'daal', 'veg'),
  ('dsh_lauki_chana_dal', 'Lauki Chana Dal', NULL, 'daal', 'veg'),
  ('dsh_mah_chhole_dal', 'Mah Chhole Dal', NULL, 'daal', 'veg'),
  ('dsh_makhani_dal', 'Makhani Dal', NULL, 'daal', 'veg'),
  ('dsh_masoor_dal', 'Masoor Dal', NULL, 'daal', 'veg'),
  ('dsh_masoor_dal_tadka', 'Masoor Dal Tadka', NULL, 'daal', 'veg'),
  ('dsh_mixed_dal', 'Mixed Dal', NULL, 'daal', 'veg'),
  ('dsh_moong_dal', 'Moong Dal', NULL, 'daal', 'veg'),
  ('dsh_moong_dal_tadka', 'Moong Dal Tadka', NULL, 'daal', 'veg'),
  ('dsh_moong_tadka', 'Moong Tadka', NULL, 'daal', 'veg'),
  ('dsh_pasta_minced_chicken', 'Pasta Minced Chicken', NULL, 'extra', 'non-veg'),
  ('dsh_punjabi_kadi', 'Punjabi Kadi', NULL, 'daal', 'veg'),
  ('dsh_pyaz_masoor_dal', 'Pyaz Masoor Dal', NULL, 'daal', 'veg'),
  ('dsh_rajma', 'Rajma', NULL, 'daal', 'veg'),
  ('dsh_rongi', 'Rongi', NULL, 'daal', 'veg'),
  ('dsh_rongi_dal', 'Rongi Dal', NULL, 'daal', 'veg'),
  ('dsh_rongi_masala', 'Rongi Masala', NULL, 'daal', 'veg'),
  ('dsh_rongi_onion_tadka', 'Rongi Onion Tadka', NULL, 'daal', 'veg'),
  ('dsh_rongi_onion_masala', 'Rongi Onion masala', NULL, 'daal', 'veg'),
  ('dsh_rongi_tadka', 'Rongi Tadka', NULL, 'daal', 'veg'),
  ('dsh_rongi_urd_dal', 'Rongi Urd Dal', NULL, 'daal', 'veg'),
  ('dsh_urad_dal', 'Urad Dal', NULL, 'daal', 'veg'),
  ('dsh_urad_whole', 'Urad Whole', NULL, 'daal', 'veg'),
  ('dsh_urad_rongi_mixed_dal', 'Urad+ Rongi Mixed Dal', NULL, 'daal', 'veg'),
  ('dsh_urd_chana_dal', 'Urd & Chana Dal', NULL, 'daal', 'veg'),
  ('dsh_white_chana', 'White Chana', NULL, 'daal', 'veg'),
  ('dsh_whole_masoor', 'Whole Masoor', NULL, 'daal', 'veg'),
  ('dsh_yellow_dal', 'Yellow Dal', NULL, 'daal', 'veg'),
  ('dsh_yellow_dal_masala', 'Yellow Dal Masala', NULL, 'daal', 'veg'),
  ('dsh_achari_chicken', 'Achari Chicken', NULL, 'sabzi', 'non-veg'),
  ('dsh_achari_fish', 'Achari Fish', NULL, 'sabzi', 'non-veg'),
  ('dsh_butter_chicken', 'Butter Chicken', NULL, 'sabzi', 'non-veg'),
  ('dsh_chicken', 'Chicken', NULL, 'sabzi', 'non-veg'),
  ('dsh_chicken_capsicum_onion', 'Chicken Capsicum Onion', NULL, 'sabzi', 'non-veg'),
  ('dsh_chicken_cooked_homestyle', 'Chicken Cooked Homestyle', NULL, 'sabzi', 'non-veg'),
  ('dsh_chicken_curry', 'Chicken Curry', NULL, 'sabzi', 'non-veg'),
  ('dsh_chicken_curry_patta_flavor', 'Chicken Curry Patta Flavor', NULL, 'sabzi', 'non-veg'),
  ('dsh_chicken_home_style', 'Chicken Home Style', NULL, 'sabzi', 'non-veg'),
  ('dsh_chicken_kofta_curry', 'Chicken Kofta Curry', NULL, 'sabzi', 'non-veg'),
  ('dsh_chicken_korma', 'Chicken Korma', NULL, 'sabzi', 'non-veg'),
  ('dsh_chicken_korma_spicy', 'Chicken Korma Spicy', NULL, 'sabzi', 'non-veg'),
  ('dsh_chicken_makhani', 'Chicken Makhani', NULL, 'sabzi', 'non-veg'),
  ('dsh_chicken_masala', 'Chicken Masala', NULL, 'sabzi', 'non-veg'),
  ('dsh_chicken_methi', 'Chicken Methi', NULL, 'sabzi', 'non-veg'),
  ('dsh_chicken_methiwala', 'Chicken Methiwala', NULL, 'sabzi', 'non-veg'),
  ('dsh_chicken_tikka_masala', 'Chicken Tikka Masala', NULL, 'sabzi', 'non-veg'),
  ('dsh_chicken_vindaloo', 'Chicken Vindaloo', NULL, 'sabzi', 'non-veg'),
  ('dsh_chicken_kofta', 'Chicken kofta', NULL, 'sabzi', 'non-veg'),
  ('dsh_chicken_pepper_masala', 'Chicken pepper masala', NULL, 'sabzi', 'non-veg'),
  ('dsh_chilli_chicken', 'Chilli Chicken', NULL, 'sabzi', 'non-veg'),
  ('dsh_chilli_chicken_spicy', 'Chilli Chicken Spicy', NULL, 'sabzi', 'non-veg'),
  ('dsh_chilli_chicken_wings', 'Chilli Chicken wings', NULL, 'sabzi', 'non-veg'),
  ('dsh_curry_chicken_homestyle', 'Curry Chicken Homestyle', NULL, 'sabzi', 'non-veg'),
  ('dsh_egg_curry', 'Egg Curry', NULL, 'sabzi', 'non-veg'),
  ('dsh_fish_curry', 'Fish Curry', NULL, 'sabzi', 'non-veg'),
  ('dsh_fish_masala', 'Fish Masala', NULL, 'sabzi', 'non-veg'),
  ('dsh_kadai_chicken', 'Kadai Chicken', NULL, 'sabzi', 'non-veg'),
  ('dsh_keema_chicken', 'Keema Chicken', NULL, 'sabzi', 'non-veg'),
  ('dsh_keema_kofta_kashmiri', 'Keema Kofta Kashmiri', NULL, 'sabzi', 'non-veg'),
  ('dsh_madras_chicken', 'Madras Chicken', NULL, 'sabzi', 'non-veg'),
  ('dsh_methi_chicken', 'Methi Chicken', NULL, 'sabzi', 'non-veg'),
  ('dsh_methi_chicken_curry', 'Methi Chicken Curry', NULL, 'sabzi', 'non-veg'),
  ('dsh_murg_do_piyaza', 'Murg do Piyaza', NULL, 'sabzi', 'non-veg'),
  ('dsh_palak_chicken', 'Palak Chicken', NULL, 'sabzi', 'non-veg'),
  ('dsh_saag_chicken', 'Saag Chicken', NULL, 'sabzi', 'non-veg'),
  ('dsh_spicy_butter_chicken', 'Spicy Butter Chicken', NULL, 'sabzi', 'non-veg'),
  ('dsh_spicy_chicken', 'Spicy Chicken', NULL, 'sabzi', 'non-veg'),
  ('dsh_spicy_makhani_chicken', 'Spicy Makhani Chicken', NULL, 'sabzi', 'non-veg'),
  ('dsh_vindaloo_spicy_chicken', 'Vindaloo Spicy Chicken', NULL, 'sabzi', 'non-veg'),
  -- Staples the real menu spreadsheet doesn't cover at all (no roti, plain
  -- rice, raita, or salad items in any of its sheets) — every meal size's
  -- composition still needs one dish in each of these categories per plan,
  -- or menuService.release refuses the week for being short a category.
  ('dsh_jeera_rice_veg', 'Jeera Rice (Veg)', 'Basmati rice tempered with cumin', 'rice', 'veg'),
  ('dsh_jeera_rice_nonveg', 'Jeera Rice (Non-Veg)', 'Basmati rice tempered with cumin', 'rice', 'non-veg'),
  ('dsh_roti_veg', 'Roti (Veg)', 'Soft whole-wheat flatbread', 'roti', 'veg'),
  ('dsh_roti_nonveg', 'Roti (Non-Veg)', 'Soft whole-wheat flatbread', 'roti', 'non-veg'),
  ('dsh_boondi_raita_veg', 'Boondi Raita (Veg)', 'Whisked yoghurt with crisp gram-flour pearls', 'raita', 'veg'),
  ('dsh_boondi_raita_nonveg', 'Boondi Raita (Non-Veg)', 'Whisked yoghurt with crisp gram-flour pearls', 'raita', 'non-veg'),
  ('dsh_kachumber_salad_veg', 'Kachumber Salad (Veg)', 'Diced cucumber, tomato and onion with lemon', 'salad', 'veg'),
  ('dsh_kachumber_salad_nonveg', 'Kachumber Salad (Non-Veg)', 'Diced cucumber, tomato and onion with lemon', 'salad', 'non-veg')
) AS v(public_id, name, description, category, plan_key)
WHERE NOT EXISTS (SELECT 1 FROM dishes d WHERE d.name = v.name);

-- ============ PLAN DISPLAY TAGS ============ (rendered verbatim; no code reads them)
UPDATE plans SET tag_label = 'Veg',      tag_color = '#16a34a' WHERE key = 'veg'      AND tag_label IS NULL;
UPDATE plans SET tag_label = 'Non-veg',  tag_color = '#dc2626' WHERE key = 'non-veg'  AND tag_label IS NULL;

-- ============ MENU: WEEK + ITEMS ============ (next Monday UTC; guard week+items on week_start existing)
WITH next_monday AS (SELECT d + (CASE WHEN dow = 0 THEN 1 ELSE 8 - dow END) AS week_start
                     FROM (SELECT d, EXTRACT(DOW FROM d)::INT AS dow
                           FROM (SELECT (NOW() AT TIME ZONE 'utc')::DATE AS d) t0) t1),
     new_week AS (
         INSERT INTO menu_weeks (public_id, created_at, updated_at, week_start, status, order_cutoff)
             SELECT 'mnw_' || TO_CHAR(nm.week_start, 'yyyymmdd'),
                    (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
                    (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
                    nm.week_start,
                    'released',
                    (EXTRACT(EPOCH FROM ((nm.week_start - INTERVAL '1 day') AT TIME ZONE 'utc')) * 1000)::BIGINT
             FROM next_monday nm
             WHERE NOT EXISTS (SELECT 1
                               FROM menu_weeks mw
                               WHERE mw.week_start = nm.week_start)
             RETURNING id)
INSERT
INTO menu_items (public_id, created_at, updated_at, menu_week_id, day_of_week, category_id, dish_id, is_default, position)
SELECT 'mni_' || SUBSTR(MD5(RANDOM()::TEXT || day.d || dsh.rn::TEXT), 1, 10),
       (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
       (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
       nw.id,
       day.d::day_of_week,
       -- Each dish sits in its OWN category, resolved to the dish_categories row. This used
       -- to be the literal 'lunch' in a free-text `slot` column — not a category key at all,
       -- so every seeded item pointed at something that did not exist and nothing complained.
       dsh.category_id,
       dsh.id,
       (dsh.rn = 1),
       dsh.rn - 1
FROM new_week nw
         CROSS JOIN (VALUES ('mon'), ('tue'), ('wed'), ('thu'), ('fri')) AS day(d)
         CROSS JOIN (SELECT d.id,
                            dc.id AS category_id,
                            ROW_NUMBER() OVER (PARTITION BY d.category ORDER BY want.ord) AS rn
                     -- dishes.name is globally unique now, so it alone identifies one row.
                     FROM (VALUES ('Dal Tadka', 1),
                                  ('Paneer Makhani', 2),
                                  ('Gobhi Aloo', 3),
                                  ('Chicken Curry', 4),
                                  ('Egg Curry', 5),
                                  ('Jeera Rice (Veg)', 6),
                                  ('Roti (Veg)', 7),
                                  ('Boondi Raita (Veg)', 8),
                                  ('Kachumber Salad (Veg)', 9),
                                  ('Achari Paneer', 10)) AS want(name, ord)
                              JOIN dishes d ON d.name = want.name
                              JOIN dish_categories dc ON dc.key = d.category) AS dsh;


COMMIT;

-- Verify:
-- select 'lead_sources' t, count(*) from lead_sources union all
-- select 'lead_subsources', count(*) from lead_subsources union all
-- select 'plans', count(*) from plans union all
-- select 'meal_sizes', count(*) from meal_sizes union all
-- select 'meal_size_items', count(*) from meal_size_items union all
-- select 'delivery_frequencies', count(*) from delivery_frequencies union all
-- select 'duration_packages', count(*) from duration_packages union all
-- select 'delivery_zones', count(*) from delivery_zones union all
-- select 'pricing_tiers', count(*) from pricing_tiers union all
-- select 'feature_flags', count(*) from feature_flags union all
-- select 'app', count(*) from app union all
-- select 'event_payout', count(*) from event_payout union all
-- select 'coin_rate', count(*) from coin_rate union all
-- select 'dish_categories', count(*) from dish_categories union all
-- select 'dishes', count(*) from dishes union all
-- select 'menu_weeks', count(*) from menu_weeks union all
-- select 'menu_items', count(*) from menu_items;
