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
       (SELECT plan_id FROM meal_sizes WHERE key = v.meal_size_key),
       v.tu_amount, v.max_tu_amount, v.sort_order
FROM (VALUES
  -- Small Thali: 1×12oz Sabzi + Rice + 2 Rotis
  ('small_thali', 'Sabzi', 1.5, NULL, 0),
  ('small_thali', 'Rice', 1, NULL, 1),
  ('small_thali', 'Roti', 0.25, NULL, 2),
  ('small_thali', 'Roti', 0.25, NULL, 3),
  -- Sabzi Only — Regular: 2 Sabzi(8oz) + 1 Daal(8oz)
  ('sabzi_only_regular_veg', 'Sabzi', 1, NULL, 0),
  ('sabzi_only_regular_veg', 'Sabzi', 1, NULL, 1),
  ('sabzi_only_regular_veg', 'Daal', 1, NULL, 2),
  ('sabzi_only_regular_nonveg', 'Sabzi', 1, NULL, 0),
  ('sabzi_only_regular_nonveg', 'Sabzi', 1, NULL, 1),
  ('sabzi_only_regular_nonveg', 'Daal', 1, NULL, 2),
  -- Sabzi Only — Large: 2 Sabzi(12oz) + 1 Sabzi(8oz) — no Daal, per the sheet
  ('sabzi_only_large_veg', 'Sabzi', 1.5, NULL, 0),
  ('sabzi_only_large_veg', 'Sabzi', 1.5, NULL, 1),
  ('sabzi_only_large_veg', 'Sabzi', 1, NULL, 2),
  ('sabzi_only_large_nonveg', 'Sabzi', 1.5, NULL, 0),
  ('sabzi_only_large_nonveg', 'Sabzi', 1.5, NULL, 1),
  ('sabzi_only_large_nonveg', 'Sabzi', 1, NULL, 2),
  -- 4 Item Thali — Regular: 1 Sabzi(8oz) + 1 Daal(8oz) + Rice + 2 Rotis
  ('item4_regular_veg', 'Sabzi', 1, NULL, 0),
  ('item4_regular_veg', 'Daal', 1, NULL, 1),
  ('item4_regular_veg', 'Rice', 1, NULL, 2),
  ('item4_regular_veg', 'Roti', 0.25, NULL, 3),
  ('item4_regular_veg', 'Roti', 0.25, NULL, 4),
  ('item4_regular_nonveg', 'Sabzi', 1, NULL, 0),
  ('item4_regular_nonveg', 'Daal', 1, NULL, 1),
  ('item4_regular_nonveg', 'Rice', 1, NULL, 2),
  ('item4_regular_nonveg', 'Roti', 0.25, NULL, 3),
  ('item4_regular_nonveg', 'Roti', 0.25, NULL, 4),
  -- 4 Item Thali — Large: 1 Sabzi(12oz) + 1 Daal(12oz) + Rice + 4 Rotis
  ('item4_large_veg', 'Sabzi', 1.5, NULL, 0),
  ('item4_large_veg', 'Daal', 1.5, NULL, 1),
  ('item4_large_veg', 'Rice', 1, NULL, 2),
  ('item4_large_veg', 'Roti', 0.25, NULL, 3),
  ('item4_large_veg', 'Roti', 0.25, NULL, 4),
  ('item4_large_veg', 'Roti', 0.25, NULL, 5),
  ('item4_large_veg', 'Roti', 0.25, NULL, 6),
  ('item4_large_nonveg', 'Sabzi', 1.5, NULL, 0),
  ('item4_large_nonveg', 'Daal', 1.5, NULL, 1),
  ('item4_large_nonveg', 'Rice', 1, NULL, 2),
  ('item4_large_nonveg', 'Roti', 0.25, NULL, 3),
  ('item4_large_nonveg', 'Roti', 0.25, NULL, 4),
  ('item4_large_nonveg', 'Roti', 0.25, NULL, 5),
  ('item4_large_nonveg', 'Roti', 0.25, NULL, 6),
  -- 5 Item Thali — Regular: 2 Sabzi(8oz) + 1 Daal(8oz)/Salad/Raita + Rice + 3 Rotis.
  -- The "/Salad/Raita" alternative is the existing daal<->salad / daal<->raita swap
  -- pairs below, not a separate composition row — the sheet's base is Daal.
  ('item5_regular_veg', 'Sabzi', 1, NULL, 0),
  ('item5_regular_veg', 'Sabzi', 1, NULL, 1),
  ('item5_regular_veg', 'Daal', 1, NULL, 2),
  ('item5_regular_veg', 'Rice', 1, NULL, 3),
  ('item5_regular_veg', 'Roti', 0.25, NULL, 4),
  ('item5_regular_veg', 'Roti', 0.25, NULL, 5),
  ('item5_regular_veg', 'Roti', 0.25, NULL, 6),
  ('item5_regular_nonveg', 'Sabzi', 1, NULL, 0),
  ('item5_regular_nonveg', 'Sabzi', 1, NULL, 1),
  ('item5_regular_nonveg', 'Daal', 1, NULL, 2),
  ('item5_regular_nonveg', 'Rice', 1, NULL, 3),
  ('item5_regular_nonveg', 'Roti', 0.25, NULL, 4),
  ('item5_regular_nonveg', 'Roti', 0.25, NULL, 5),
  ('item5_regular_nonveg', 'Roti', 0.25, NULL, 6),
  -- New Thali Plan — Regular: 1 Sabzi(8oz) + 1 Daal(8oz) + 8 Rotis — no rice
  ('new_thali_veg', 'Sabzi', 1, NULL, 0),
  ('new_thali_veg', 'Daal', 1, NULL, 1),
  ('new_thali_veg', 'Roti', 0.25, NULL, 2),
  ('new_thali_veg', 'Roti', 0.25, NULL, 3),
  ('new_thali_veg', 'Roti', 0.25, NULL, 4),
  ('new_thali_veg', 'Roti', 0.25, NULL, 5),
  ('new_thali_veg', 'Roti', 0.25, NULL, 6),
  ('new_thali_veg', 'Roti', 0.25, NULL, 7),
  ('new_thali_veg', 'Roti', 0.25, NULL, 8),
  ('new_thali_veg', 'Roti', 0.25, NULL, 9),
  ('new_thali_nonveg', 'Sabzi', 1, NULL, 0),
  ('new_thali_nonveg', 'Daal', 1, NULL, 1),
  ('new_thali_nonveg', 'Roti', 0.25, NULL, 2),
  ('new_thali_nonveg', 'Roti', 0.25, NULL, 3),
  ('new_thali_nonveg', 'Roti', 0.25, NULL, 4),
  ('new_thali_nonveg', 'Roti', 0.25, NULL, 5),
  ('new_thali_nonveg', 'Roti', 0.25, NULL, 6),
  ('new_thali_nonveg', 'Roti', 0.25, NULL, 7),
  ('new_thali_nonveg', 'Roti', 0.25, NULL, 8),
  ('new_thali_nonveg', 'Roti', 0.25, NULL, 9),
  -- 5 Item Thali — Large: 1 Sabzi(12oz) + 1 Daal(12oz) + 1 Sabzi(8oz)/Salad/Raita + Rice + 6 Rotis
  ('item5_large_veg', 'Sabzi', 1.5, NULL, 0),
  ('item5_large_veg', 'Daal', 1.5, NULL, 1),
  ('item5_large_veg', 'Sabzi', 1, NULL, 2),
  ('item5_large_veg', 'Rice', 1, NULL, 3),
  ('item5_large_veg', 'Roti', 0.25, NULL, 4),
  ('item5_large_veg', 'Roti', 0.25, NULL, 5),
  ('item5_large_veg', 'Roti', 0.25, NULL, 6),
  ('item5_large_veg', 'Roti', 0.25, NULL, 7),
  ('item5_large_veg', 'Roti', 0.25, NULL, 8),
  ('item5_large_veg', 'Roti', 0.25, NULL, 9),
  ('item5_large_nonveg', 'Sabzi', 1.5, NULL, 0),
  ('item5_large_nonveg', 'Daal', 1.5, NULL, 1),
  ('item5_large_nonveg', 'Sabzi', 1, NULL, 2),
  ('item5_large_nonveg', 'Rice', 1, NULL, 3),
  ('item5_large_nonveg', 'Roti', 0.25, NULL, 4),
  ('item5_large_nonveg', 'Roti', 0.25, NULL, 5),
  ('item5_large_nonveg', 'Roti', 0.25, NULL, 6),
  ('item5_large_nonveg', 'Roti', 0.25, NULL, 7),
  ('item5_large_nonveg', 'Roti', 0.25, NULL, 8),
  ('item5_large_nonveg', 'Roti', 0.25, NULL, 9),
  -- Maharaja Thali: 1 Sabzi(12oz) + 1 Daal(12oz) + 1 Sabzi(8oz) + Salad + Raita + Rice + 8 Rotis
  ('maharaja_veg', 'Sabzi', 1.5, NULL, 0),
  ('maharaja_veg', 'Daal', 1.5, NULL, 1),
  ('maharaja_veg', 'Sabzi', 1, NULL, 2),
  ('maharaja_veg', 'Salad', 1, 2, 3),
  ('maharaja_veg', 'Raita', 1, 2, 4),
  ('maharaja_veg', 'Rice', 1, NULL, 5),
  ('maharaja_veg', 'Roti', 0.25, NULL, 6),
  ('maharaja_veg', 'Roti', 0.25, NULL, 7),
  ('maharaja_veg', 'Roti', 0.25, NULL, 8),
  ('maharaja_veg', 'Roti', 0.25, NULL, 9),
  ('maharaja_veg', 'Roti', 0.25, NULL, 10),
  ('maharaja_veg', 'Roti', 0.25, NULL, 11),
  ('maharaja_veg', 'Roti', 0.25, NULL, 12),
  ('maharaja_veg', 'Roti', 0.25, NULL, 13),
  ('maharaja_nonveg', 'Sabzi', 1.5, NULL, 0),
  ('maharaja_nonveg', 'Daal', 1.5, NULL, 1),
  ('maharaja_nonveg', 'Sabzi', 1, NULL, 2),
  ('maharaja_nonveg', 'Salad', 1, 2, 3),
  ('maharaja_nonveg', 'Raita', 1, 2, 4),
  ('maharaja_nonveg', 'Rice', 1, NULL, 5),
  ('maharaja_nonveg', 'Roti', 0.25, NULL, 6),
  ('maharaja_nonveg', 'Roti', 0.25, NULL, 7),
  ('maharaja_nonveg', 'Roti', 0.25, NULL, 8),
  ('maharaja_nonveg', 'Roti', 0.25, NULL, 9),
  ('maharaja_nonveg', 'Roti', 0.25, NULL, 10),
  ('maharaja_nonveg', 'Roti', 0.25, NULL, 11),
  ('maharaja_nonveg', 'Roti', 0.25, NULL, 12),
  ('maharaja_nonveg', 'Roti', 0.25, NULL, 13)
) AS v(meal_size_key, name, tu_amount, max_tu_amount, sort_order);

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
DELETE FROM category_swap_pairs WHERE id > 0;
INSERT INTO category_swap_pairs (public_id, created_at, updated_at, from_category_id, to_category_id)
SELECT 'csp_' || SUBSTR(MD5(v.from_key || v.to_key), 1, 10),
       (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
       (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
       (SELECT id FROM dish_categories WHERE key = v.from_key),
       (SELECT id FROM dish_categories WHERE key = v.to_key)
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
INSERT INTO dishes (public_id, created_at, updated_at, name, description, category, plan_id)
SELECT v.public_id,
       (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
       (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
       v.name,
       v.description,
       v.category,
       (SELECT id FROM plans WHERE key = v.plan_key)
FROM (VALUES
  -- "Items counted as Daal" on the pricing sheet — the daal slot's real rotation,
  -- not a single fixed dish. Shared across both tiffin plans (2 rows each).
  ('dsh_dal_tadka_veg', 'Dal Tadka', 'Yellow lentils tempered with cumin and garlic', 'daal', 'veg'),
  ('dsh_dal_tadka_nonveg', 'Dal Tadka', 'Yellow lentils tempered with cumin and garlic', 'daal', 'non-veg'),
  ('dsh_lobia_masala_veg', 'Lobia Masala', 'Black-eyed peas simmered in a spiced onion-tomato masala', 'daal', 'veg'),
  ('dsh_lobia_masala_nonveg', 'Lobia Masala', 'Black-eyed peas simmered in a spiced onion-tomato masala', 'daal', 'non-veg'),
  ('dsh_rajma_veg', 'Rajma', 'Red kidney beans in a thick Punjabi-style curry', 'daal', 'veg'),
  ('dsh_rajma_nonveg', 'Rajma', 'Red kidney beans in a thick Punjabi-style curry', 'daal', 'non-veg'),
  ('dsh_kadhi_veg', 'Kadhi', 'Yoghurt-and-gram-flour curry tempered with cumin', 'daal', 'veg'),
  ('dsh_kadhi_nonveg', 'Kadhi', 'Yoghurt-and-gram-flour curry tempered with cumin', 'daal', 'non-veg'),
  ('dsh_chana_masala_veg', 'Chana Masala', 'Chickpeas simmered in a spiced tomato masala', 'daal', 'veg'),
  ('dsh_chana_masala_nonveg', 'Chana Masala', 'Chickpeas simmered in a spiced tomato masala', 'daal', 'non-veg'),
  ('dsh_tur_daal_veg', 'Tur Daal', 'Split pigeon peas tempered with cumin and garlic', 'daal', 'veg'),
  ('dsh_tur_daal_nonveg', 'Tur Daal', 'Split pigeon peas tempered with cumin and garlic', 'daal', 'non-veg'),
  ('dsh_paneer_butter_masala_veg', 'Paneer Butter Masala', 'Paneer in a rich tomato-cream sauce', 'sabzi', 'veg'),
  ('dsh_paneer_butter_masala_nonveg', 'Paneer Butter Masala', 'Paneer in a rich tomato-cream sauce', 'sabzi', 'non-veg'),
  ('dsh_aloo_gobi_veg', 'Aloo Gobi', 'Potato and cauliflower dry sabzi', 'sabzi', 'veg'),
  ('dsh_aloo_gobi_nonveg', 'Aloo Gobi', 'Potato and cauliflower dry sabzi', 'sabzi', 'non-veg'),
  -- Non-veg-only dishes: one row, non-veg plan.
  ('dsh_chicken_curry', 'Chicken Curry', 'Tender chicken in a spiced onion-tomato gravy', 'sabzi', 'non-veg'),
  ('dsh_egg_bhurji', 'Egg Bhurji', 'Spiced scrambled eggs with onion and peppers', 'extra', 'non-veg'),
  -- Staples. Both tiffin plans' meal sizes ask for rice, roti, raita and salad,
  -- so without a dish in each of those categories no menu week can be released:
  -- menuService.release refuses a week that leaves a plan short of a category its
  -- meal sizes promise. These make the seeded catalog self-consistent on both plans.
  ('dsh_jeera_rice_veg', 'Jeera Rice', 'Basmati rice tempered with cumin', 'rice', 'veg'),
  ('dsh_jeera_rice_nonveg', 'Jeera Rice', 'Basmati rice tempered with cumin', 'rice', 'non-veg'),
  ('dsh_roti_veg', 'Roti', 'Soft whole-wheat flatbread', 'roti', 'veg'),
  ('dsh_roti_nonveg', 'Roti', 'Soft whole-wheat flatbread', 'roti', 'non-veg'),
  ('dsh_boondi_raita_veg', 'Boondi Raita', 'Whisked yoghurt with crisp gram-flour pearls', 'raita', 'veg'),
  ('dsh_boondi_raita_nonveg', 'Boondi Raita', 'Whisked yoghurt with crisp gram-flour pearls', 'raita', 'non-veg'),
  ('dsh_kachumber_salad_veg', 'Kachumber Salad', 'Diced cucumber, tomato and onion with lemon', 'salad', 'veg'),
  ('dsh_kachumber_salad_nonveg', 'Kachumber Salad', 'Diced cucumber, tomato and onion with lemon', 'salad', 'non-veg'),
  -- Egg Bhurji is the only other 'extra', and it is non-veg only, so the veg
  -- plan needs its own.
  ('dsh_masala_papad', 'Masala Papad', 'Roasted papad topped with onion, tomato and chaat masala', 'extra', 'veg')
) AS v(public_id, name, description, category, plan_key)
WHERE NOT EXISTS (
  SELECT 1 FROM dishes d WHERE d.name = v.name AND d.plan_id = (SELECT id FROM plans WHERE key = v.plan_key)
);

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
                     -- Each row picks one (name, plan) dish variant explicitly — a dish
                     -- name alone no longer identifies one row now that names can repeat
                     -- once per plan.
                     FROM (VALUES ('Dal Tadka', 'veg', 1),
                                  ('Paneer Butter Masala', 'veg', 2),
                                  ('Aloo Gobi', 'non-veg', 3),
                                  ('Chicken Curry', 'non-veg', 4),
                                  ('Egg Bhurji', 'non-veg', 5),
                                  ('Jeera Rice', 'veg', 6),
                                  ('Roti', 'veg', 7),
                                  ('Boondi Raita', 'veg', 8),
                                  ('Kachumber Salad', 'veg', 9),
                                  ('Masala Papad', 'veg', 10)) AS want(name, plan_key, ord)
                              JOIN dishes d ON d.name = want.name AND d.plan_id = (SELECT id FROM plans WHERE key = want.plan_key)
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
