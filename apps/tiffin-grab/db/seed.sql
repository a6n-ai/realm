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
         },
         "healthy": {
           "accent": "#1FAE54",
           "titlePrefix": "Healthy Menu"
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
INSERT INTO plans (public_id, created_at, updated_at, key, name, description, plan_type,
                   allowed_start_days)
VALUES ('pln_veg', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, 'veg',
        'Pure Vegetarian Plan', 'Seasonal vegetables, paneer, daal, rotis, raitas.', 'tiffin',
        ARRAY ['mon','tue','wed','thu','fri']),
       ('pln_halal_nonveg', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        'non-veg', 'Non-Veg Plan', 'Poultry, mutton, egg masalas, daals, chapatis.', 'tiffin',
        ARRAY ['mon','tue','wed','thu','fri']),
       ('pln_healthy', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        'healthy', 'Healthy Plan', 'Breakfast, lunch, and dinner — pick the slots you want.', 'healthy',
        ARRAY ['mon','tue','wed','thu','fri'])
ON CONFLICT (key) DO NOTHING;

-- ============ MEAL SIZES ============ (17 real tiffingrab.ca sizes; components='[]' placeholder
-- derived below from meal_size_items. kcal per tier: budget 450-650, medium 650-900, premium 900-1300.
-- Macros left NULL. trial=true only for the two trial sizes.)
-- plan_id resolves each size to its owning plan by key (veg-diet→veg, nonveg-diet→non-veg).
INSERT INTO meal_sizes (public_id, created_at, updated_at, key, name, plan_id, tier, trial, components, kcal_min, kcal_max,
                        protein_g, carbs_g, fat_g, base_price)
SELECT v.public_id,
       (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
       (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
       v.key, v.name,
       (SELECT id FROM plans WHERE key = v.plan_key),
       v.tier::meal_tier, v.trial, '[]'::jsonb,
       v.kcal_min, v.kcal_max, NULL, NULL, NULL, v.base_price
FROM (VALUES
  ('msz_small_thali', 'small_thali', 'Small Thali', 'veg', 'budget', FALSE, 450, 650, 8.50),
  ('msz_sabzi_only_veg', 'sabzi_only_veg', 'Sabzi Only (Veg)', 'veg', 'budget', FALSE, 450, 650, 9.00),
  ('msz_veg_4_regular', 'veg_4_regular', '4-Item Veg Thali (Regular)', 'veg', 'medium', FALSE, 650, 900, 10.00),
  ('msz_sabzi_only_nonveg', 'sabzi_only_nonveg', 'Sabzi Only (Non-Veg)', 'non-veg', 'budget', FALSE, 450, 650, 10.00),
  ('msz_veg_5_regular', 'veg_5_regular', '5-Item Veg Thali (Regular)', 'veg', 'medium', FALSE, 650, 900, 11.00),
  ('msz_nonveg_4_regular', 'nonveg_4_regular', '4-Item Non-Veg Thali (Regular)', 'non-veg', 'medium', FALSE, 650, 900, 11.00),
  ('msz_new_plan_veg', 'new_plan_veg', 'New Plan (Veg)', 'veg', 'medium', FALSE, 650, 900, 11.50),
  ('msz_veg_4_large', 'veg_4_large', '4-Item Veg Thali (Large)', 'veg', 'medium', FALSE, 650, 900, 11.50),
  ('msz_nonveg_5_regular', 'nonveg_5_regular', '5-Item Non-Veg Thali (Regular)', 'non-veg', 'medium', FALSE, 650, 900, 12.00),
  ('msz_new_plan_nonveg', 'new_plan_nonveg', 'New Plan (Non-Veg)', 'non-veg', 'medium', FALSE, 650, 900, 12.50),
  ('msz_nonveg_4_large', 'nonveg_4_large', '4-Item Non-Veg Thali (Large)', 'non-veg', 'medium', FALSE, 650, 900, 12.50),
  ('msz_veg_5_large', 'veg_5_large', '5-Item Veg Thali (Large)', 'veg', 'premium', FALSE, 900, 1300, 13.00),
  ('msz_maharaja_veg', 'maharaja_veg', 'Maharaja Thali (Veg)', 'veg', 'premium', FALSE, 900, 1300, 14.00),
  ('msz_nonveg_5_large', 'nonveg_5_large', '5-Item Non-Veg Thali (Large)', 'non-veg', 'premium', FALSE, 900, 1300, 14.00),
  ('msz_trial_veg', 'trial_veg', 'Trial Meal (Veg) 5-Item', 'veg', 'premium', TRUE, 900, 1300, 14.50),
  ('msz_maharaja_nonveg', 'maharaja_nonveg', 'Maharaja Thali (Non-Veg)', 'non-veg', 'premium', FALSE, 900, 1300, 14.75),
  ('msz_trial_nonveg', 'trial_nonveg', 'Trial Meal (Non-Veg) 5-Item', 'non-veg', 'premium', TRUE, 900, 1300, 15.50)
) AS v(public_id, key, name, plan_key, tier, trial, kcal_min, kcal_max, base_price)
ON CONFLICT (key) DO NOTHING;

-- ============ MEAL SIZE ITEMS ============ (FK by meal_sizes.key subquery; no unique key -> wipe+reinsert
-- like pricing_tiers. roti rows: qty=N, weight_value=NULL, weight_unit='piece'; weighed items unit='oz'.
-- meal_size_id is NOT NULL so a mistyped meal_size_key fails the insert loudly instead of orphaning a row.)
DELETE FROM meal_size_items;
INSERT INTO meal_size_items
  (public_id, created_at, updated_at, meal_size_id, name, category, qty, weight_value, weight_unit, sort_order)
SELECT 'msi_' || SUBSTR(MD5(v.meal_size_key || v.name || v.sort_order::TEXT), 1, 10),
       (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
       (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
       (SELECT id FROM meal_sizes WHERE key = v.meal_size_key),
       -- category is a soft ref to dish_categories.key; map each real item name to its key.
       v.name,
       CASE v.name
         WHEN 'Sabzi' THEN 'sabzi'
         WHEN 'Daal' THEN 'daal'
         WHEN 'Curry' THEN 'curry'
         WHEN 'Rice' THEN 'rice'
         WHEN 'Roti' THEN 'roti'
         WHEN 'Extra' THEN 'extra'
         WHEN 'Salad' THEN 'salad'
         WHEN 'Raita' THEN 'raita'
       END,
       v.qty, v.weight_value, v.weight_unit::weight_unit, v.sort_order
FROM (VALUES
  ('small_thali', 'Sabzi', 1, 12, 'oz', 0),
  ('small_thali', 'Rice', 1, 12, 'oz', 1),
  ('small_thali', 'Roti', 2, NULL, 'piece', 2),
  ('sabzi_only_veg', 'Sabzi', 2, 8, 'oz', 0),
  ('sabzi_only_veg', 'Daal', 1, 8, 'oz', 1),
  ('veg_4_regular', 'Sabzi', 1, 8, 'oz', 0),
  ('veg_4_regular', 'Daal', 1, 8, 'oz', 1),
  ('veg_4_regular', 'Rice', 1, 12, 'oz', 2),
  ('veg_4_regular', 'Roti', 2, NULL, 'piece', 3),
  ('sabzi_only_nonveg', 'Sabzi', 1, 8, 'oz', 0),
  ('sabzi_only_nonveg', 'Curry', 1, 8, 'oz', 1),
  ('sabzi_only_nonveg', 'Daal', 1, 8, 'oz', 2),
  ('veg_5_regular', 'Sabzi', 1, 8, 'oz', 0),
  ('veg_5_regular', 'Daal', 1, 8, 'oz', 1),
  ('veg_5_regular', 'Extra', 1, 8, 'oz', 2),
  ('veg_5_regular', 'Rice', 1, 12, 'oz', 3),
  ('veg_5_regular', 'Roti', 3, NULL, 'piece', 4),
  ('nonveg_4_regular', 'Curry', 1, 8, 'oz', 0),
  ('nonveg_4_regular', 'Daal', 1, 8, 'oz', 1),
  ('nonveg_4_regular', 'Rice', 1, 12, 'oz', 2),
  ('nonveg_4_regular', 'Roti', 2, NULL, 'piece', 3),
  ('new_plan_veg', 'Sabzi', 1, 8, 'oz', 0),
  ('new_plan_veg', 'Daal', 1, 8, 'oz', 1),
  ('new_plan_veg', 'Roti', 8, NULL, 'piece', 2),
  ('veg_4_large', 'Sabzi', 1, 12, 'oz', 0),
  ('veg_4_large', 'Daal', 1, 12, 'oz', 1),
  ('veg_4_large', 'Rice', 1, 12, 'oz', 2),
  ('veg_4_large', 'Roti', 4, NULL, 'piece', 3),
  ('nonveg_5_regular', 'Curry', 1, 8, 'oz', 0),
  ('nonveg_5_regular', 'Daal', 1, 8, 'oz', 1),
  ('nonveg_5_regular', 'Extra', 1, 8, 'oz', 2),
  ('nonveg_5_regular', 'Rice', 1, 12, 'oz', 3),
  ('nonveg_5_regular', 'Roti', 3, NULL, 'piece', 4),
  ('new_plan_nonveg', 'Curry', 1, 8, 'oz', 0),
  ('new_plan_nonveg', 'Daal', 1, 8, 'oz', 1),
  ('new_plan_nonveg', 'Roti', 8, NULL, 'piece', 2),
  ('nonveg_4_large', 'Curry', 1, 12, 'oz', 0),
  ('nonveg_4_large', 'Daal', 1, 12, 'oz', 1),
  ('nonveg_4_large', 'Rice', 1, 12, 'oz', 2),
  ('nonveg_4_large', 'Roti', 4, NULL, 'piece', 3),
  ('veg_5_large', 'Sabzi', 1, 12, 'oz', 0),
  ('veg_5_large', 'Daal', 1, 12, 'oz', 1),
  ('veg_5_large', 'Extra', 1, 8, 'oz', 2),
  ('veg_5_large', 'Rice', 1, 12, 'oz', 3),
  ('veg_5_large', 'Roti', 6, NULL, 'piece', 4),
  ('maharaja_veg', 'Sabzi', 1, 12, 'oz', 0),
  ('maharaja_veg', 'Daal', 1, 12, 'oz', 1),
  ('maharaja_veg', 'Extra', 1, 8, 'oz', 2),
  ('maharaja_veg', 'Salad', 1, 8, 'oz', 3),
  ('maharaja_veg', 'Raita', 1, 8, 'oz', 4),
  ('maharaja_veg', 'Rice', 1, 12, 'oz', 5),
  ('maharaja_veg', 'Roti', 8, NULL, 'piece', 6),
  ('nonveg_5_large', 'Curry', 1, 12, 'oz', 0),
  ('nonveg_5_large', 'Daal', 1, 12, 'oz', 1),
  ('nonveg_5_large', 'Extra', 1, 8, 'oz', 2),
  ('nonveg_5_large', 'Rice', 1, 12, 'oz', 3),
  ('nonveg_5_large', 'Roti', 6, NULL, 'piece', 4),
  ('trial_veg', 'Sabzi', 1, 8, 'oz', 0),
  ('trial_veg', 'Daal', 1, 8, 'oz', 1),
  ('trial_veg', 'Extra', 1, 8, 'oz', 2),
  ('trial_veg', 'Rice', 1, 12, 'oz', 3),
  ('trial_veg', 'Roti', 3, NULL, 'piece', 4),
  ('maharaja_nonveg', 'Curry', 1, 12, 'oz', 0),
  ('maharaja_nonveg', 'Daal', 1, 12, 'oz', 1),
  ('maharaja_nonveg', 'Extra', 1, 8, 'oz', 2),
  ('maharaja_nonveg', 'Salad', 1, 8, 'oz', 3),
  ('maharaja_nonveg', 'Raita', 1, 8, 'oz', 4),
  ('maharaja_nonveg', 'Rice', 1, 12, 'oz', 5),
  ('maharaja_nonveg', 'Roti', 8, NULL, 'piece', 6),
  ('trial_nonveg', 'Curry', 1, 8, 'oz', 0),
  ('trial_nonveg', 'Daal', 1, 8, 'oz', 1),
  ('trial_nonveg', 'Extra', 1, 8, 'oz', 2),
  ('trial_nonveg', 'Rice', 1, 12, 'oz', 3),
  ('trial_nonveg', 'Roti', 3, NULL, 'piece', 4)
) AS v(meal_size_key, name, qty, weight_value, weight_unit, sort_order);

-- Derive human-readable components[] from the structured items (single source of truth).
-- Runs unconditionally: the meal_sizes INSERT above uses ON CONFLICT DO NOTHING and seeds
-- components='[]', so only this UPDATE populates it (and refreshes it on every reseed).
UPDATE meal_sizes ms SET components = COALESCE((
  SELECT json_agg(
           CASE WHEN i.weight_value IS NULL
                THEN i.qty || '× ' || i.name
                ELSE i.qty || '× ' || i.name || ' ' || rtrim(rtrim(i.weight_value::text, '0'), '.') || i.weight_unit
           END
           ORDER BY i.sort_order)
  FROM meal_size_items i WHERE i.meal_size_id = ms.id
), '[]'::json)::jsonb;

-- ============ DELIVERY FREQUENCIES ============
INSERT INTO delivery_frequencies (public_id, created_at, updated_at, key, name, days_per_week, courier_discount_pct)
VALUES ('frq_5_day', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, '5_day',
        '5 Days/Wk (Mon–Fri)', 5, 0),
       ('frq_mwf', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, 'mwf',
        '3 Days/Wk Alternate (MWF)', 3, 10)
ON CONFLICT (key) DO NOTHING;

-- ============ DURATION PACKAGES ============
INSERT INTO duration_packages (public_id, created_at, updated_at, weeks, discount_pct)
VALUES ('dur_w1', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, 1, 0),
       ('dur_w2', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, 2, 2),
       ('dur_w4', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, 4, 5),
       ('dur_w8', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, 8, 10),
       ('dur_w12', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, 12, 15)
ON CONFLICT (weeks) DO NOTHING;

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
DELETE
FROM pricing_tiers;
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
                             sort_order)
VALUES ('slt_tiffin_sabzi', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        'sabzi', 'Sabzi', TRUE, TRUE, 1),
       ('slt_tiffin_rice', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        'rice', 'Rice', TRUE, FALSE, 2),
       ('slt_tiffin_roti', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        'roti', 'Roti', TRUE, FALSE, 3),
       ('slt_tiffin_raita', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        'raita', 'Raita', TRUE, FALSE, 4),
       ('slt_tiffin_salad', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        'salad', 'Salad', TRUE, FALSE, 5),
       ('slt_tiffin_daal', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        'daal', 'Daal', TRUE, FALSE, 6),
       ('slt_tiffin_curry', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        'curry', 'Curry', TRUE, TRUE, 7),
       ('slt_tiffin_extra', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        'extra', 'Extra', TRUE, FALSE, 8),
       ('slt_healthy_protein', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        'protein', 'Protein', TRUE, FALSE, 1),
       ('slt_healthy_grain', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        'grain', 'Grain', TRUE, FALSE, 2),
       ('slt_healthy_veg', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        'veg', 'Veg', TRUE, TRUE, 3)
-- No second 'salad' row: `key` is unique now, and the one salad slot is attached
-- to the tiffin AND healthy plans below instead of being duplicated per type.
ON CONFLICT (key) DO NOTHING;

-- ============ CATEGORY -> PLANS ============
-- Which plans each slot belongs to. Tiffin slots go to both tiffin plans (a
-- non-veg thali still has sabzi/daal/roti); healthy slots to the healthy plan.
-- `salad` belongs to all three, which is what lets it be a single row.
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
  ('curry','veg'),('curry','non-veg'),
  ('extra','veg'),('extra','non-veg'),
  ('salad','veg'),('salad','non-veg'),('salad','healthy'),
  ('protein','healthy'),('grain','healthy'),('veg','healthy')
) AS v(cat_key, plan_key)
WHERE NOT EXISTS (
  SELECT 1 FROM category_plans cp
  WHERE cp.category_id = (SELECT id FROM dish_categories WHERE key = v.cat_key)
    AND cp.plan_id = (SELECT id FROM plans WHERE key = v.plan_key)
);

-- ============ MENU: DISHES ============ (no unique key -> guard with NOT EXISTS on name)
INSERT INTO dishes (public_id, created_at, updated_at, name, description, category)
SELECT v.public_id,
       (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
       (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
       v.name,
       v.description,
       v.category
FROM (VALUES ('dsh_dal_tadka', 'Dal Tadka', 'Yellow lentils tempered with cumin and garlic', 'veg', 'daal'),
             ('dsh_paneer_butter_masala', 'Paneer Butter Masala', 'Paneer in a rich tomato-cream sauce', 'veg', 'curry'),
             ('dsh_aloo_gobi', 'Aloo Gobi', 'Potato and cauliflower dry sabzi', 'veg', 'sabzi'),
             ('dsh_chicken_curry', 'Chicken Curry', 'Tender chicken in a spiced onion-tomato gravy', 'nonveg', 'curry'),
             ('dsh_egg_bhurji', 'Egg Bhurji', 'Spiced scrambled eggs with onion and peppers', 'nonveg', 'extra'),
             -- Staples. Both tiffin plans' meal sizes ask for rice, roti, raita and salad,
             -- so without a dish in each of those categories no menu week can be released:
             -- menuService.release refuses a week that leaves a plan short of a category its
             -- meal sizes promise. These four make the seeded catalog self-consistent.
             ('dsh_jeera_rice', 'Jeera Rice', 'Basmati rice tempered with cumin', 'veg', 'rice'),
             ('dsh_roti', 'Roti', 'Soft whole-wheat flatbread', 'veg', 'roti'),
             ('dsh_boondi_raita', 'Boondi Raita', 'Whisked yoghurt with crisp gram-flour pearls', 'veg', 'raita'),
             ('dsh_kachumber_salad', 'Kachumber Salad', 'Diced cucumber, tomato and onion with lemon', 'veg', 'salad'),
             -- Egg Bhurji is the only other 'extra', and it is non-veg only, so the veg
             -- plan needs its own.
             ('dsh_masala_papad', 'Masala Papad', 'Roasted papad topped with onion, tomato and chaat masala', 'veg', 'extra')) AS v(public_id, name, description, diet, category)
WHERE NOT EXISTS (SELECT 1 FROM dishes d WHERE d.name = v.name);

-- ============ DISH -> PLANS ============
-- Replaces the old dishes.diet column. A vegetarian dish is attached to BOTH the
-- veg and non-veg plans, because a non-veg thali still contains sabzi, daal and
-- roti. A non-veg dish is attached only to the non-veg plan, which is what stops
-- it ever reaching a vegetarian subscriber — every menu query joins through here.
INSERT INTO dish_plans (public_id, created_at, updated_at, dish_id, plan_id)
SELECT 'dpl_' || SUBSTR(MD5(v.dish_public_id || v.plan_key), 1, 10),
       (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
       (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
       (SELECT id FROM dishes WHERE public_id = v.dish_public_id),
       (SELECT id FROM plans WHERE key = v.plan_key)
FROM (VALUES
  ('dsh_dal_tadka','veg'),            ('dsh_dal_tadka','non-veg'),
  ('dsh_paneer_butter_masala','veg'), ('dsh_paneer_butter_masala','non-veg'),
  ('dsh_aloo_gobi','veg'),            ('dsh_aloo_gobi','non-veg'),
  ('dsh_chicken_curry','non-veg'),
  ('dsh_egg_bhurji','non-veg'),
  -- Staples reach both tiffin plans: a non-veg thali still contains rice, roti,
  -- raita and salad.
  ('dsh_jeera_rice','veg'),           ('dsh_jeera_rice','non-veg'),
  ('dsh_roti','veg'),                 ('dsh_roti','non-veg'),
  ('dsh_boondi_raita','veg'),         ('dsh_boondi_raita','non-veg'),
  ('dsh_kachumber_salad','veg'),      ('dsh_kachumber_salad','non-veg'),
  ('dsh_masala_papad','veg'),         ('dsh_masala_papad','non-veg')
) AS v(dish_public_id, plan_key)
WHERE NOT EXISTS (
  SELECT 1 FROM dish_plans dp
  WHERE dp.dish_id = (SELECT id FROM dishes WHERE public_id = v.dish_public_id)
    AND dp.plan_id = (SELECT id FROM plans WHERE key = v.plan_key)
);

-- ============ PLAN DISPLAY TAGS ============ (rendered verbatim; no code reads them)
UPDATE plans SET tag_label = 'Veg',      tag_color = '#16a34a' WHERE key = 'veg'      AND tag_label IS NULL;
UPDATE plans SET tag_label = 'Non-veg',  tag_color = '#dc2626' WHERE key = 'non-veg'  AND tag_label IS NULL;
UPDATE plans SET tag_label = 'Healthy',  tag_color = '#0d9488' WHERE key = 'healthy'  AND tag_label IS NULL;

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
                     FROM (VALUES ('Dal Tadka', 1),
                                  ('Paneer Butter Masala', 2),
                                  ('Aloo Gobi', 3),
                                  ('Chicken Curry', 4),
                                  ('Egg Bhurji', 5),
                                  ('Jeera Rice', 6),
                                  ('Roti', 7),
                                  ('Boondi Raita', 8),
                                  ('Kachumber Salad', 9),
                                  ('Masala Papad', 10)) AS want(name, ord)
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
