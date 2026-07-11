-- Full database seed: lead sources, catalog, feature flags, app settings, wallet, menu.
-- Data only — no admin/staff users (password hashing, created via app) and no
-- notification templates (authored via UI).
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
INSERT INTO meal_sizes (public_id, created_at, updated_at, key, name, plan_type, tier, diet, trial, components, kcal_min, kcal_max,
                        protein_g, carbs_g, fat_g, base_price)
VALUES ('msz_small_thali', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        'small_thali', 'Small Thali', 'tiffin', 'budget', 'veg', FALSE, '[]'::jsonb, 450, 650, NULL, NULL, NULL, 8.50),
       ('msz_sabzi_only_veg', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        'sabzi_only_veg', 'Sabzi Only (Veg)', 'tiffin', 'budget', 'veg', FALSE, '[]'::jsonb, 450, 650, NULL, NULL, NULL, 9.00),
       ('msz_veg_4_regular', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        'veg_4_regular', '4-Item Veg Thali (Regular)', 'tiffin', 'medium', 'veg', FALSE, '[]'::jsonb, 650, 900, NULL, NULL, NULL, 10.00),
       ('msz_sabzi_only_nonveg', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        'sabzi_only_nonveg', 'Sabzi Only (Non-Veg)', 'tiffin', 'budget', 'nonveg', FALSE, '[]'::jsonb, 450, 650, NULL, NULL, NULL, 10.00),
       ('msz_veg_5_regular', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        'veg_5_regular', '5-Item Veg Thali (Regular)', 'tiffin', 'medium', 'veg', FALSE, '[]'::jsonb, 650, 900, NULL, NULL, NULL, 11.00),
       ('msz_nonveg_4_regular', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        'nonveg_4_regular', '4-Item Non-Veg Thali (Regular)', 'tiffin', 'medium', 'nonveg', FALSE, '[]'::jsonb, 650, 900, NULL, NULL, NULL, 11.00),
       ('msz_new_plan_veg', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        'new_plan_veg', 'New Plan (Veg)', 'tiffin', 'medium', 'veg', FALSE, '[]'::jsonb, 650, 900, NULL, NULL, NULL, 11.50),
       ('msz_veg_4_large', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        'veg_4_large', '4-Item Veg Thali (Large)', 'tiffin', 'medium', 'veg', FALSE, '[]'::jsonb, 650, 900, NULL, NULL, NULL, 11.50),
       ('msz_nonveg_5_regular', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        'nonveg_5_regular', '5-Item Non-Veg Thali (Regular)', 'tiffin', 'medium', 'nonveg', FALSE, '[]'::jsonb, 650, 900, NULL, NULL, NULL, 12.00),
       ('msz_new_plan_nonveg', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        'new_plan_nonveg', 'New Plan (Non-Veg)', 'tiffin', 'medium', 'nonveg', FALSE, '[]'::jsonb, 650, 900, NULL, NULL, NULL, 12.50),
       ('msz_nonveg_4_large', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        'nonveg_4_large', '4-Item Non-Veg Thali (Large)', 'tiffin', 'medium', 'nonveg', FALSE, '[]'::jsonb, 650, 900, NULL, NULL, NULL, 12.50),
       ('msz_veg_5_large', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        'veg_5_large', '5-Item Veg Thali (Large)', 'tiffin', 'premium', 'veg', FALSE, '[]'::jsonb, 900, 1300, NULL, NULL, NULL, 13.00),
       ('msz_maharaja_veg', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        'maharaja_veg', 'Maharaja Thali (Veg)', 'tiffin', 'premium', 'veg', FALSE, '[]'::jsonb, 900, 1300, NULL, NULL, NULL, 14.00),
       ('msz_nonveg_5_large', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        'nonveg_5_large', '5-Item Non-Veg Thali (Large)', 'tiffin', 'premium', 'nonveg', FALSE, '[]'::jsonb, 900, 1300, NULL, NULL, NULL, 14.00),
       ('msz_trial_veg', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        'trial_veg', 'Trial Meal (Veg) 5-Item', 'tiffin', 'premium', 'veg', TRUE, '[]'::jsonb, 900, 1300, NULL, NULL, NULL, 14.50),
       ('msz_maharaja_nonveg', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        'maharaja_nonveg', 'Maharaja Thali (Non-Veg)', 'tiffin', 'premium', 'nonveg', FALSE, '[]'::jsonb, 900, 1300, NULL, NULL, NULL, 14.75),
       ('msz_trial_nonveg', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        'trial_nonveg', 'Trial Meal (Non-Veg) 5-Item', 'tiffin', 'premium', 'nonveg', TRUE, '[]'::jsonb, 900, 1300, NULL, NULL, NULL, 15.50)
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

-- ============ MENU: DISH CATEGORIES ============
INSERT INTO dish_categories (public_id, created_at, updated_at, plan_type, key, label, enabled, selectable,
                             sort_order)
VALUES ('slt_tiffin_sabzi', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        'tiffin', 'sabzi', 'Sabzi', TRUE, TRUE, 1),
       ('slt_tiffin_rice', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        'tiffin', 'rice', 'Rice', TRUE, FALSE, 2),
       ('slt_tiffin_roti', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        'tiffin', 'roti', 'Roti', TRUE, FALSE, 3),
       ('slt_tiffin_raita', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        'tiffin', 'raita', 'Raita', TRUE, FALSE, 4),
       ('slt_tiffin_salad', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        'tiffin', 'salad', 'Salad', TRUE, FALSE, 5),
       ('slt_tiffin_daal', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        'tiffin', 'daal', 'Daal', TRUE, FALSE, 6),
       ('slt_tiffin_curry', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        'tiffin', 'curry', 'Curry', TRUE, TRUE, 7),
       ('slt_tiffin_extra', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        'tiffin', 'extra', 'Extra', TRUE, FALSE, 8),
       ('slt_healthy_protein', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        'healthy', 'protein', 'Protein', TRUE, FALSE, 1),
       ('slt_healthy_grain', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        'healthy', 'grain', 'Grain', TRUE, FALSE, 2),
       ('slt_healthy_veg', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        'healthy', 'veg', 'Veg', TRUE, TRUE, 3),
       ('slt_healthy_salad', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        'healthy', 'salad', 'Salad', TRUE, FALSE, 4)
ON CONFLICT (plan_type, key) DO NOTHING;

-- ============ MENU: DISHES ============ (no unique key -> guard with NOT EXISTS on name)
INSERT INTO dishes (public_id, created_at, updated_at, name, description, diet, category)
SELECT v.public_id,
       (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
       (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
       v.name,
       v.description,
       v.diet::dish_diet,
       v.category
FROM (VALUES ('dsh_dal_tadka', 'Dal Tadka', 'Yellow lentils tempered with cumin and garlic', 'veg', 'daal'),
             ('dsh_paneer_butter_masala', 'Paneer Butter Masala', 'Paneer in a rich tomato-cream sauce', 'veg', 'curry'),
             ('dsh_aloo_gobi', 'Aloo Gobi', 'Potato and cauliflower dry sabzi', 'veg', 'sabzi'),
             ('dsh_chicken_curry', 'Chicken Curry', 'Tender chicken in a spiced onion-tomato gravy', 'nonveg', 'curry'),
             ('dsh_egg_bhurji', 'Egg Bhurji', 'Spiced scrambled eggs with onion and peppers', 'nonveg', 'extra')) AS v(public_id, name, description, diet, category)
WHERE NOT EXISTS (SELECT 1 FROM dishes d WHERE d.name = v.name);

-- ============ MENU: WEEK + ITEMS ============ (next Monday UTC; guard week+items on week_start existing)
WITH next_monday AS (SELECT d + (CASE WHEN dow = 0 THEN 1 ELSE 8 - dow END) AS week_start
                     FROM (SELECT d, EXTRACT(DOW FROM d)::INT AS dow
                           FROM (SELECT (NOW() AT TIME ZONE 'utc')::DATE AS d) t0) t1),
     new_week AS (
         INSERT INTO menu_weeks (public_id, created_at, updated_at, plan_type, week_start, status, order_cutoff)
             SELECT 'mnw_' || TO_CHAR(nm.week_start, 'yyyymmdd'),
                    (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
                    (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
                    'tiffin',
                    nm.week_start,
                    'released',
                    (EXTRACT(EPOCH FROM ((nm.week_start - INTERVAL '1 day') AT TIME ZONE 'utc')) * 1000)::BIGINT
             FROM next_monday nm
             WHERE NOT EXISTS (SELECT 1
                               FROM menu_weeks mw
                               WHERE mw.plan_type = 'tiffin' AND mw.week_start = nm.week_start)
             RETURNING id)
INSERT
INTO menu_items (public_id, created_at, updated_at, menu_week_id, day_of_week, slot, dish_id, is_default, position)
SELECT 'mni_' || SUBSTR(MD5(RANDOM()::TEXT || day.d || dsh.rn::TEXT), 1, 10),
       (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
       (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
       nw.id,
       day.d::day_of_week,
       'lunch',
       dsh.id,
       (dsh.rn = 1),
       dsh.rn - 1
FROM new_week nw
         CROSS JOIN (VALUES ('mon'), ('tue'), ('wed'), ('thu'), ('fri')) AS day(d)
         CROSS JOIN (SELECT d.id, ROW_NUMBER() OVER (ORDER BY want.ord) AS rn
                     FROM (VALUES ('Dal Tadka', 1),
                                  ('Paneer Butter Masala', 2),
                                  ('Aloo Gobi', 3),
                                  ('Chicken Curry', 4),
                                  ('Egg Bhurji', 5)) AS want(name, ord)
                              JOIN dishes d ON d.name = want.name) AS dsh;

-- ============ ADMIN USER ============
-- Seeded admin with a temporary password ("changeme123"). password_set=false
-- forces a password reset on first login. Change it after logging in.
WITH admin AS (
    INSERT INTO users (public_id, created_at, updated_at, name, email, email_verified, role, password_set)
        SELECT 'usr_admin_seed',
               (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
               (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
               'Admin',
               'info@tiffingrab.ca',
               TRUE,
               'admin',
               FALSE
        WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'info@tiffingrab.ca')
        RETURNING id)
INSERT
INTO account (id, public_id, account_id, provider_id, user_id, password)
SELECT (next_id())::TEXT,
       'act_admin_seed',
       a.id::TEXT,
       'credential',
       a.id,
       '$2b$10$Gsig1JM7UdYxUpD1IVKUiuWaUUdSXGpMIL3K4qsh2B57BWwK0P/ni'
FROM admin a;

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
