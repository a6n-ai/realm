-- Full database seed: lead sources, catalog, feature flags, app settings, wallet, menu.
-- Data only — no admin/staff users (password hashing, created via app) and no
-- notification templates (authored via UI).
-- id -> next_id() (DB). public_id/created_at/updated_at have NO db default -> supplied here.
-- Idempotent: ON CONFLICT (<unique>) DO NOTHING; tables without a unique key use NOT EXISTS
-- guards. pricing_tiers has no unique key -> wipe+insert.
-- Epoch-ms helper repeated inline: (extract(epoch from now())*1000)::bigint

begin;

-- ============ LEAD SOURCES ============
insert into lead_sources (public_id, created_at, updated_at, key, label, is_inbound) values
  ('lsr_manual',    (extract(epoch from now())*1000)::bigint, (extract(epoch from now())*1000)::bigint, 'manual',    'Manual',    false),
  ('lsr_referral',  (extract(epoch from now())*1000)::bigint, (extract(epoch from now())*1000)::bigint, 'referral',  'Referral',  true),
  ('lsr_website',   (extract(epoch from now())*1000)::bigint, (extract(epoch from now())*1000)::bigint, 'website',   'Website',   true),
  ('lsr_google',    (extract(epoch from now())*1000)::bigint, (extract(epoch from now())*1000)::bigint, 'google',    'Google',    true),
  ('lsr_facebook',  (extract(epoch from now())*1000)::bigint, (extract(epoch from now())*1000)::bigint, 'facebook',  'Facebook',  true),
  ('lsr_instagram', (extract(epoch from now())*1000)::bigint, (extract(epoch from now())*1000)::bigint, 'instagram', 'Instagram', true)
on conflict (key) do nothing;

-- ============ LEAD SUBSOURCES ============ (key not unique -> guard with NOT EXISTS)
insert into lead_subsources (public_id, created_at, updated_at, source_id, key, label)
select v.public_id, (extract(epoch from now())*1000)::bigint, (extract(epoch from now())*1000)::bigint,
       (select id from lead_sources where key = v.source_key), v.key, v.label
from (values
  ('lss_fb_feed',   'facebook',  'facebook_feed',   'Facebook Feed'),
  ('lss_fb_ads',    'facebook',  'facebook_ads',    'Facebook Ads'),
  ('lss_ig_reels',  'instagram', 'instagram_reels', 'Instagram Reels')
) as v(public_id, source_key, key, label)
where not exists (select 1 from lead_subsources s where s.key = v.key);

-- ============ PLANS ============
insert into plans (public_id, created_at, updated_at, key, name, description, plan_type, offered_slots, allowed_start_days) values
  ('pln_veg',          (extract(epoch from now())*1000)::bigint, (extract(epoch from now())*1000)::bigint, 'veg',          'Pure Vegetarian Plan',     'Seasonal vegetables, paneer, daal, rotis, raitas.',       'tiffin',  array['lunch'],                       array['mon','tue','wed','thu','fri']),
  ('pln_halal_nonveg', (extract(epoch from now())*1000)::bigint, (extract(epoch from now())*1000)::bigint, 'halal_nonveg', 'Halal Non-Veg Plan',       'Poultry, mutton, egg masalas, daals, chapatis.',          'tiffin',  array['lunch'],                       array['mon','tue','wed','thu','fri']),
  ('pln_mixed',        (extract(epoch from now())*1000)::bigint, (extract(epoch from now())*1000)::bigint, 'mixed',        'Veg & Non-Veg Mixed Plan', 'Alternating vegetarian and non-vegetarian days.',         'tiffin',  array['lunch'],                       array['mon','tue','wed','thu','fri']),
  ('pln_healthy',      (extract(epoch from now())*1000)::bigint, (extract(epoch from now())*1000)::bigint, 'healthy',      'Healthy Plan',             'Breakfast, lunch, and dinner — pick the slots you want.', 'healthy', array['breakfast','lunch','dinner'], array['mon','tue','wed','thu','fri'])
on conflict (key) do nothing;

-- ============ MEAL SIZES ============
insert into meal_sizes (public_id, created_at, updated_at, key, name, tier, diet, components, kcal_min, kcal_max, protein_g, carbs_g, fat_g, base_price) values
  ('msz_small_thali',       (extract(epoch from now())*1000)::bigint, (extract(epoch from now())*1000)::bigint, 'small_thali',       'Small Thali',           'budget',  'veg',  '["12oz Sabzi","12oz Rice","2 Rotis"]'::jsonb,                                          550,  650,  18, 90,  16, 9.99),
  ('msz_sabzi_only',        (extract(epoch from now())*1000)::bigint, (extract(epoch from now())*1000)::bigint, 'sabzi_only',        'Sabzi Only',            'budget',  'veg',  '["2x 8oz Sabzi","8oz Daal"]'::jsonb,                                                   400,  550,  20, 45,  18, 8.49),
  ('msz_four_item_regular', (extract(epoch from now())*1000)::bigint, (extract(epoch from now())*1000)::bigint, 'four_item_regular', '4-Item Thali (Regular)', 'medium', 'both', '["8oz Sabzi","8oz Daal","12oz Rice","2 Rotis"]'::jsonb,                                750,  850,  28, 110, 22, 11.99),
  ('msz_four_item_large',   (extract(epoch from now())*1000)::bigint, (extract(epoch from now())*1000)::bigint, 'four_item_large',   '4-Item Thali (Large)',   'medium', 'both', '["12oz Sabzi","12oz Daal","12oz Rice","4 Rotis"]'::jsonb,                              950,  1100, 36, 140, 28, 13.99),
  ('msz_five_item_regular', (extract(epoch from now())*1000)::bigint, (extract(epoch from now())*1000)::bigint, 'five_item_regular', '5-Item Thali (Regular)', 'medium', 'both', '["8oz Sabzi","8oz Daal","12oz Rice","3 Rotis","8oz Raita/Salad"]'::jsonb,              850,  1000, 32, 125, 26, 13.49),
  ('msz_new_thali',         (extract(epoch from now())*1000)::bigint, (extract(epoch from now())*1000)::bigint, 'new_thali',         'New Thali',             'medium',  'both', '["8oz Sabzi","8oz Daal","8 Rotis"]'::jsonb,                                            900,  1100, 34, 130, 24, 12.49),
  ('msz_five_item_large',   (extract(epoch from now())*1000)::bigint, (extract(epoch from now())*1000)::bigint, 'five_item_large',   '5-Item Thali (Large)',   'premium', 'both', '["12oz Sabzi","12oz Daal","12oz Rice","6 Rotis","Salad","Raita"]'::jsonb,              1200, 1450, 44, 165, 34, 16.99),
  ('msz_maharaja_thali',    (extract(epoch from now())*1000)::bigint, (extract(epoch from now())*1000)::bigint, 'maharaja_thali',    'Maharaja Thali',        'premium', 'both', '["12oz Sabzi","12oz Daal","8oz Sabzi","12oz Rice","8 Rotis","Salad","Raita"]'::jsonb,  1500, 1750, 52, 190, 40, 19.99)
on conflict (key) do nothing;

-- ============ DELIVERY FREQUENCIES ============
insert into delivery_frequencies (public_id, created_at, updated_at, key, name, days_per_week, courier_discount_pct) values
  ('frq_5_day', (extract(epoch from now())*1000)::bigint, (extract(epoch from now())*1000)::bigint, '5_day', '5 Days/Wk (Mon–Fri)',       5, 0),
  ('frq_mwf',   (extract(epoch from now())*1000)::bigint, (extract(epoch from now())*1000)::bigint, 'mwf',   '3 Days/Wk Alternate (MWF)', 3, 10)
on conflict (key) do nothing;

-- ============ DURATION PACKAGES ============
insert into duration_packages (public_id, created_at, updated_at, weeks, discount_pct) values
  ('dur_w1',  (extract(epoch from now())*1000)::bigint, (extract(epoch from now())*1000)::bigint, 1,  0),
  ('dur_w2',  (extract(epoch from now())*1000)::bigint, (extract(epoch from now())*1000)::bigint, 2,  2),
  ('dur_w4',  (extract(epoch from now())*1000)::bigint, (extract(epoch from now())*1000)::bigint, 4,  5),
  ('dur_w8',  (extract(epoch from now())*1000)::bigint, (extract(epoch from now())*1000)::bigint, 8,  10),
  ('dur_w12', (extract(epoch from now())*1000)::bigint, (extract(epoch from now())*1000)::bigint, 12, 15)
on conflict (weeks) do nothing;

-- ============ DELIVERY ZONES ============
insert into delivery_zones (public_id, created_at, updated_at, name, postal_prefixes, slot_window) values
  ('zon_etobicoke',     (extract(epoch from now())*1000)::bigint, (extract(epoch from now())*1000)::bigint, 'Etobicoke',     array['M8','M9'],                                                          '9:00 AM – 12:00 PM'),
  ('zon_mississauga',   (extract(epoch from now())*1000)::bigint, (extract(epoch from now())*1000)::bigint, 'Mississauga',   array['L5'],                                                               '10:00 AM – 1:00 PM'),
  ('zon_brampton',      (extract(epoch from now())*1000)::bigint, (extract(epoch from now())*1000)::bigint, 'Brampton',      array['L6P','L6R','L6S','L6T','L6V','L6W','L6X','L6Y','L6Z','L7A'],          '11:00 AM – 2:00 PM'),
  ('zon_toronto',       (extract(epoch from now())*1000)::bigint, (extract(epoch from now())*1000)::bigint, 'Toronto',       array['M4','M5','M6'],                                                     '10:00 AM – 1:00 PM'),
  ('zon_scarborough',   (extract(epoch from now())*1000)::bigint, (extract(epoch from now())*1000)::bigint, 'Scarborough',   array['M1'],                                                               '12:00 PM – 3:00 PM'),
  ('zon_markham',       (extract(epoch from now())*1000)::bigint, (extract(epoch from now())*1000)::bigint, 'Markham',       array['L3R','L3S','L3P','L6B','L6C','L6E','L6G'],                           '11:00 AM – 2:00 PM'),
  ('zon_richmond_hill', (extract(epoch from now())*1000)::bigint, (extract(epoch from now())*1000)::bigint, 'Richmond Hill', array['L4B','L4C','L4E','L4S'],                                            '11:00 AM – 2:00 PM'),
  ('zon_north_york',    (extract(epoch from now())*1000)::bigint, (extract(epoch from now())*1000)::bigint, 'North York',    array['M2','M3'],                                                          '10:00 AM – 1:00 PM'),
  ('zon_vaughan',       (extract(epoch from now())*1000)::bigint, (extract(epoch from now())*1000)::bigint, 'Vaughan',       array['L4H','L4J','L4K','L4L','L6A'],                                       '11:00 AM – 2:00 PM'),
  ('zon_oakville',      (extract(epoch from now())*1000)::bigint, (extract(epoch from now())*1000)::bigint, 'Oakville',      array['L6H','L6J','L6K','L6L','L6M'],                                       '12:00 PM – 3:00 PM'),
  ('zon_east_york',     (extract(epoch from now())*1000)::bigint, (extract(epoch from now())*1000)::bigint, 'East York',     array['M4B','M4C','M4G','M4H','M4J','M4K'],                                 '10:00 AM – 1:00 PM')
on conflict (name) do nothing;

-- ============ PRICING TIERS ============ (no unique key -> wipe + reinsert, matches seed)
delete from pricing_tiers;
insert into pricing_tiers (public_id, created_at, updated_at, min_qty, max_qty, uplift_pct) values
  ('ptr_1',  (extract(epoch from now())*1000)::bigint, (extract(epoch from now())*1000)::bigint, 1,  11,   20.00),
  ('ptr_2',  (extract(epoch from now())*1000)::bigint, (extract(epoch from now())*1000)::bigint, 12, 19,   10.00),
  ('ptr_3',  (extract(epoch from now())*1000)::bigint, (extract(epoch from now())*1000)::bigint, 20, null, 0.00);

-- ============ FEATURE FLAGS ============
insert into feature_flags (public_id, created_at, updated_at, key, label, description, default_enabled) values
  ('flg_subscription_wizard', (extract(epoch from now())*1000)::bigint, (extract(epoch from now())*1000)::bigint, 'subscription_wizard', 'Subscription Wizard', 'Access the plan builder', true),
  ('flg_admin_console',       (extract(epoch from now())*1000)::bigint, (extract(epoch from now())*1000)::bigint, 'admin_console',       'Admin Console',       'User & flag administration', false)
on conflict (key) do nothing;

-- ============ APP SETTINGS ============ (no unique key -> insert one row only if none exists)
insert into app_settings (public_id, created_at, updated_at, timezone, cutoff_hour, meal_types)
select 'aps_default', (extract(epoch from now())*1000)::bigint, (extract(epoch from now())*1000)::bigint,
       'America/Toronto', 18,
       '{"tiffin":{"accent":"#F0820A","titlePrefix":"Tiffin Menu"},"healthy":{"accent":"#1FAE54","titlePrefix":"Healthy Menu"}}'::jsonb
where not exists (select 1 from app_settings);

-- ============ WALLET: EVENT PAYOUTS ============ (one row per app_event enum value)
insert into event_payout (public_id, created_at, updated_at, event_type, enabled, coins)
select 'evp_' || ev::text, (extract(epoch from now())*1000)::bigint, (extract(epoch from now())*1000)::bigint, ev, false, 0
from unnest(enum_range(null::app_event)) as ev
on conflict (event_type) do nothing;

-- ============ WALLET: COIN RATE ============ (no unique key -> guard with NOT EXISTS per currency)
insert into coin_rate (public_id, created_at, currency, value_per_coin)
select 'cnr_cad_default', (extract(epoch from now())*1000)::bigint, 'CAD', 0.1000
where not exists (select 1 from coin_rate where currency = 'CAD');

-- ============ MENU: MEAL SLOTS ============
insert into meal_slots (public_id, created_at, updated_at, plan_type, key, label, enabled, sort_order) values
  ('slt_tiffin_lunch',       (extract(epoch from now())*1000)::bigint, (extract(epoch from now())*1000)::bigint, 'tiffin',  'lunch',     'Lunch',     true, 1),
  ('slt_healthy_breakfast',  (extract(epoch from now())*1000)::bigint, (extract(epoch from now())*1000)::bigint, 'healthy', 'breakfast', 'Breakfast', true, 0),
  ('slt_healthy_lunch',      (extract(epoch from now())*1000)::bigint, (extract(epoch from now())*1000)::bigint, 'healthy', 'lunch',     'Lunch',     true, 1),
  ('slt_healthy_dinner',     (extract(epoch from now())*1000)::bigint, (extract(epoch from now())*1000)::bigint, 'healthy', 'dinner',    'Dinner',    true, 2)
on conflict (plan_type, key) do nothing;

-- ============ MENU: DISHES ============ (no unique key -> guard with NOT EXISTS on name)
insert into dishes (public_id, created_at, updated_at, name, description, diet, slots)
select v.public_id, (extract(epoch from now())*1000)::bigint, (extract(epoch from now())*1000)::bigint,
       v.name, v.description, v.diet::dish_diet, v.slots::text[]
from (values
  ('dsh_dal_tadka',             'Dal Tadka',                 'Yellow lentils tempered with cumin and garlic',   'veg',    array['lunch']),
  ('dsh_paneer_butter_masala',  'Paneer Butter Masala',      'Paneer in a rich tomato-cream sauce',              'veg',    array['lunch']),
  ('dsh_aloo_gobi',             'Aloo Gobi',                 'Potato and cauliflower dry sabzi',                 'veg',    array['lunch']),
  ('dsh_chicken_curry',         'Chicken Curry',             'Tender chicken in a spiced onion-tomato gravy',    'nonveg', array['lunch']),
  ('dsh_egg_bhurji',            'Egg Bhurji',                'Spiced scrambled eggs with onion and peppers',     'nonveg', array['lunch'])
) as v(public_id, name, description, diet, slots)
where not exists (select 1 from dishes d where d.name = v.name);

-- ============ MENU: WEEK + ITEMS ============ (next Monday UTC; guard week+items on week_start existing)
with next_monday as (
  select d + (case when dow = 0 then 1 else 8 - dow end) as week_start
  from (select d, extract(dow from d)::int as dow from (select (now() at time zone 'utc')::date as d) t0) t1
),
new_week as (
  insert into menu_weeks (public_id, created_at, updated_at, plan_type, week_start, status, order_cutoff)
  select 'mnw_' || to_char(nm.week_start, 'yyyymmdd'),
         (extract(epoch from now())*1000)::bigint,
         (extract(epoch from now())*1000)::bigint,
         'tiffin', nm.week_start, 'released',
         (extract(epoch from ((nm.week_start - interval '1 day') at time zone 'utc')) * 1000)::bigint
  from next_monday nm
  where not exists (
    select 1 from menu_weeks mw where mw.plan_type = 'tiffin' and mw.week_start = nm.week_start
  )
  returning id
)
insert into menu_items (public_id, created_at, updated_at, menu_week_id, day_of_week, slot, dish_id, is_default, position)
select 'mni_' || substr(md5(random()::text || day.d || dsh.rn::text), 1, 10),
       (extract(epoch from now())*1000)::bigint,
       (extract(epoch from now())*1000)::bigint,
       nw.id, day.d::day_of_week, 'lunch', dsh.id, (dsh.rn = 1), dsh.rn - 1
from new_week nw
cross join (values ('mon'), ('tue'), ('wed'), ('thu'), ('fri')) as day(d)
cross join (
  select d.id, row_number() over (order by want.ord) as rn
  from (values
    ('Dal Tadka', 1), ('Paneer Butter Masala', 2), ('Aloo Gobi', 3), ('Chicken Curry', 4), ('Egg Bhurji', 5)
  ) as want(name, ord)
  join dishes d on d.name = want.name
) as dsh;

commit;

-- Verify:
-- select 'lead_sources' t, count(*) from lead_sources union all
-- select 'lead_subsources', count(*) from lead_subsources union all
-- select 'plans', count(*) from plans union all
-- select 'meal_sizes', count(*) from meal_sizes union all
-- select 'delivery_frequencies', count(*) from delivery_frequencies union all
-- select 'duration_packages', count(*) from duration_packages union all
-- select 'delivery_zones', count(*) from delivery_zones union all
-- select 'pricing_tiers', count(*) from pricing_tiers union all
-- select 'feature_flags', count(*) from feature_flags union all
-- select 'app_settings', count(*) from app_settings union all
-- select 'event_payout', count(*) from event_payout union all
-- select 'coin_rate', count(*) from coin_rate union all
-- select 'meal_slots', count(*) from meal_slots union all
-- select 'dishes', count(*) from dishes union all
-- select 'menu_weeks', count(*) from menu_weeks union all
-- select 'menu_items', count(*) from menu_items;
