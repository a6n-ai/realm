-- Database seed: app tenant row + the products that were previously the
-- hardcoded MENU array in app/(marketing)/menu/page.tsx — migrated 1:1 so the
-- public Menu page keeps its current content, now editable from the admin
-- dashboard. Idempotent: NOT EXISTS guards throughout.
--
-- NO admin login here: seed the first admin with db/seed-admin.ts instead
-- (env-provided password, bcrypt-hashed at runtime, forced first-login reset).
-- A hardcoded credential must never live in this (public) repo.

BEGIN;

-- ============ APP (tenant singleton) ============
INSERT INTO app (id, public_id, app_id, created_at, updated_at, timezone, currency)
SELECT v.id,
       'aps_default',
       v.id,
       (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
       (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
       'America/Toronto',
       'CAD'
FROM (SELECT next_id() AS id) v
WHERE NOT EXISTS (SELECT 1 FROM app);

-- ============ PRODUCTS (migrated from the static MENU array) ============
INSERT INTO products (public_id, name, description, category, price, tags, created_at, updated_at)
SELECT 'prd_seed_0001', 'Aloo Puchka', 'Spiced potato, tangy tamarind water.', 'trad', 6, ARRAY['best']::text[], (extract(epoch FROM now()) * 1000)::bigint, (extract(epoch FROM now()) * 1000)::bigint
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'Aloo Puchka' AND category = 'trad');

INSERT INTO products (public_id, name, description, category, price, tags, created_at, updated_at)
SELECT 'prd_seed_0002', 'Dahi Puchka', 'Sweet yogurt, chutneys, crunch.', 'trad', 7, NULL, (extract(epoch FROM now()) * 1000)::bigint, (extract(epoch FROM now()) * 1000)::bigint
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'Dahi Puchka' AND category = 'trad');

INSERT INTO products (public_id, name, description, category, price, tags, created_at, updated_at)
SELECT 'prd_seed_0003', 'Hing Puchka', 'Bold asafoetida-spiked water.', 'trad', 6, NULL, (extract(epoch FROM now()) * 1000)::bigint, (extract(epoch FROM now()) * 1000)::bigint
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'Hing Puchka' AND category = 'trad');

INSERT INTO products (public_id, name, description, category, price, tags, created_at, updated_at)
SELECT 'prd_seed_0004', 'Meetha Puchka', 'Extra-sweet tamarind for the kids.', 'trad', 6, NULL, (extract(epoch FROM now()) * 1000)::bigint, (extract(epoch FROM now()) * 1000)::bigint
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'Meetha Puchka' AND category = 'trad');

INSERT INTO products (public_id, name, description, category, price, tags, created_at, updated_at)
SELECT 'prd_seed_0005', 'Dry Masala Puchka', 'No water, all the masala.', 'trad', 7, NULL, (extract(epoch FROM now()) * 1000)::bigint, (extract(epoch FROM now()) * 1000)::bigint
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'Dry Masala Puchka' AND category = 'trad');

INSERT INTO products (public_id, name, description, category, price, tags, created_at, updated_at)
SELECT 'prd_seed_0006', 'Chicken Corn Cheese Puchka', 'Creamy, cheesy, the internet favourite.', 'fusion', 10, ARRAY['best','viral']::text[], (extract(epoch FROM now()) * 1000)::bigint, (extract(epoch FROM now()) * 1000)::bigint
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'Chicken Corn Cheese Puchka' AND category = 'fusion');

INSERT INTO products (public_id, name, description, category, price, tags, created_at, updated_at)
SELECT 'prd_seed_0007', 'Firangi Chicken Puchka', 'Western-spiced smoky chicken.', 'fusion', 10, ARRAY['viral']::text[], (extract(epoch FROM now()) * 1000)::bigint, (extract(epoch FROM now()) * 1000)::bigint
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'Firangi Chicken Puchka' AND category = 'fusion');

INSERT INTO products (public_id, name, description, category, price, tags, created_at, updated_at)
SELECT 'prd_seed_0008', 'Paneer Schezwan Puchka', 'Indo-Chinese heat in a shell.', 'fusion', 9, ARRAY['viral']::text[], (extract(epoch FROM now()) * 1000)::bigint, (extract(epoch FROM now()) * 1000)::bigint
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'Paneer Schezwan Puchka' AND category = 'fusion');

INSERT INTO products (public_id, name, description, category, price, tags, created_at, updated_at)
SELECT 'prd_seed_0009', 'Spicy Chicken Blast Puchka', 'For the heat-seekers only.', 'fusion', 10, NULL, (extract(epoch FROM now()) * 1000)::bigint, (extract(epoch FROM now()) * 1000)::bigint
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'Spicy Chicken Blast Puchka' AND category = 'fusion');

INSERT INTO products (public_id, name, description, category, price, tags, created_at, updated_at)
SELECT 'prd_seed_0010', 'Veg Mo-Puchka', 'Momo filling meets puchka.', 'fusion', 9, ARRAY['new']::text[], (extract(epoch FROM now()) * 1000)::bigint, (extract(epoch FROM now()) * 1000)::bigint
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'Veg Mo-Puchka' AND category = 'fusion');

INSERT INTO products (public_id, name, description, category, price, tags, created_at, updated_at)
SELECT 'prd_seed_0011', 'Paneer Mo-Puchka', 'Paneer momo-puchka mashup.', 'fusion', 9, ARRAY['new']::text[], (extract(epoch FROM now()) * 1000)::bigint, (extract(epoch FROM now()) * 1000)::bigint
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'Paneer Mo-Puchka' AND category = 'fusion');

INSERT INTO products (public_id, name, description, category, price, tags, created_at, updated_at)
SELECT 'prd_seed_0012', 'Classic Vada Pav', 'Garlic chutney, fried chilli.', 'vada', 6, ARRAY['best']::text[], (extract(epoch FROM now()) * 1000)::bigint, (extract(epoch FROM now()) * 1000)::bigint
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'Classic Vada Pav' AND category = 'vada');

INSERT INTO products (public_id, name, description, category, price, tags, created_at, updated_at)
SELECT 'prd_seed_0013', 'Cheese Vada Pav', 'Molten cheese upgrade.', 'vada', 7, NULL, (extract(epoch FROM now()) * 1000)::bigint, (extract(epoch FROM now()) * 1000)::bigint
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'Cheese Vada Pav' AND category = 'vada');

INSERT INTO products (public_id, name, description, category, price, tags, created_at, updated_at)
SELECT 'prd_seed_0014', 'Schezwan Vada Pav', 'Indo-Chinese kick.', 'vada', 7, NULL, (extract(epoch FROM now()) * 1000)::bigint, (extract(epoch FROM now()) * 1000)::bigint
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'Schezwan Vada Pav' AND category = 'vada');

INSERT INTO products (public_id, name, description, category, price, tags, created_at, updated_at)
SELECT 'prd_seed_0015', 'Classic Pav Bhaji', 'Loaded with butter & lime.', 'bhaji', 10, ARRAY['best']::text[], (extract(epoch FROM now()) * 1000)::bigint, (extract(epoch FROM now()) * 1000)::bigint
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'Classic Pav Bhaji' AND category = 'bhaji');

INSERT INTO products (public_id, name, description, category, price, tags, created_at, updated_at)
SELECT 'prd_seed_0016', 'Cheese Pav Bhaji', 'Extra cheese, extra love.', 'bhaji', 12, NULL, (extract(epoch FROM now()) * 1000)::bigint, (extract(epoch FROM now()) * 1000)::bigint
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'Cheese Pav Bhaji' AND category = 'bhaji');

INSERT INTO products (public_id, name, description, category, price, tags, created_at, updated_at)
SELECT 'prd_seed_0017', 'Paneer Pav Bhaji', 'Paneer-rich twist.', 'bhaji', 12, NULL, (extract(epoch FROM now()) * 1000)::bigint, (extract(epoch FROM now()) * 1000)::bigint
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'Paneer Pav Bhaji' AND category = 'bhaji');

INSERT INTO products (public_id, name, description, category, price, tags, created_at, updated_at)
SELECT 'prd_seed_0018', 'Chicken Kathi Roll', 'Tandoori chicken, onions, chutney.', 'rolls', 9, ARRAY['best']::text[], (extract(epoch FROM now()) * 1000)::bigint, (extract(epoch FROM now()) * 1000)::bigint
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'Chicken Kathi Roll' AND category = 'rolls');

INSERT INTO products (public_id, name, description, category, price, tags, created_at, updated_at)
SELECT 'prd_seed_0019', 'Paneer Kathi Roll', 'Spiced paneer & peppers.', 'rolls', 9, NULL, (extract(epoch FROM now()) * 1000)::bigint, (extract(epoch FROM now()) * 1000)::bigint
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'Paneer Kathi Roll' AND category = 'rolls');

INSERT INTO products (public_id, name, description, category, price, tags, created_at, updated_at)
SELECT 'prd_seed_0020', 'Egg Kathi Roll', 'Classic anda roll.', 'rolls', 8, NULL, (extract(epoch FROM now()) * 1000)::bigint, (extract(epoch FROM now()) * 1000)::bigint
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'Egg Kathi Roll' AND category = 'rolls');

INSERT INTO products (public_id, name, description, category, price, tags, created_at, updated_at)
SELECT 'prd_seed_0021', 'Double Egg Chicken Roll', 'The full Kolkata experience.', 'rolls', 11, ARRAY['viral']::text[], (extract(epoch FROM now()) * 1000)::bigint, (extract(epoch FROM now()) * 1000)::bigint
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'Double Egg Chicken Roll' AND category = 'rolls');

INSERT INTO products (public_id, name, description, category, price, tags, created_at, updated_at)
SELECT 'prd_seed_0022', 'Veg Steamed Momos', '8 pcs, classic.', 'momos', 8, NULL, (extract(epoch FROM now()) * 1000)::bigint, (extract(epoch FROM now()) * 1000)::bigint
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'Veg Steamed Momos' AND category = 'momos');

INSERT INTO products (public_id, name, description, category, price, tags, created_at, updated_at)
SELECT 'prd_seed_0023', 'Chicken Steamed Momos', '8 pcs, juicy.', 'momos', 9, ARRAY['best']::text[], (extract(epoch FROM now()) * 1000)::bigint, (extract(epoch FROM now()) * 1000)::bigint
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'Chicken Steamed Momos' AND category = 'momos');

INSERT INTO products (public_id, name, description, category, price, tags, created_at, updated_at)
SELECT 'prd_seed_0024', 'Schezwan Fried Momos', 'Tossed in spicy schezwan.', 'momos', 10, ARRAY['viral']::text[], (extract(epoch FROM now()) * 1000)::bigint, (extract(epoch FROM now()) * 1000)::bigint
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'Schezwan Fried Momos' AND category = 'momos');

INSERT INTO products (public_id, name, description, category, price, tags, created_at, updated_at)
SELECT 'prd_seed_0025', 'Bhel Puri', 'Puffed rice, tamarind, crunch.', 'chaat', 7, NULL, (extract(epoch FROM now()) * 1000)::bigint, (extract(epoch FROM now()) * 1000)::bigint
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'Bhel Puri' AND category = 'chaat');

INSERT INTO products (public_id, name, description, category, price, tags, created_at, updated_at)
SELECT 'prd_seed_0026', 'Sev Puri', 'Crispy puris, loaded toppings.', 'chaat', 8, ARRAY['best']::text[], (extract(epoch FROM now()) * 1000)::bigint, (extract(epoch FROM now()) * 1000)::bigint
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'Sev Puri' AND category = 'chaat');

INSERT INTO products (public_id, name, description, category, price, tags, created_at, updated_at)
SELECT 'prd_seed_0027', 'Dahi Bhalla', 'Soft lentil dumplings in yogurt.', 'chaat', 8, NULL, (extract(epoch FROM now()) * 1000)::bigint, (extract(epoch FROM now()) * 1000)::bigint
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'Dahi Bhalla' AND category = 'chaat');

INSERT INTO products (public_id, name, description, category, price, tags, created_at, updated_at)
SELECT 'prd_seed_0028', 'Samosa Chaat', 'Crushed samosa, chole, chutneys.', 'chaat', 9, NULL, (extract(epoch FROM now()) * 1000)::bigint, (extract(epoch FROM now()) * 1000)::bigint
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'Samosa Chaat' AND category = 'chaat');

INSERT INTO products (public_id, name, description, category, price, tags, created_at, updated_at)
SELECT 'prd_seed_0029', 'Classic Masala Maggi', 'The nostalgia bowl.', 'maggi', 6, NULL, (extract(epoch FROM now()) * 1000)::bigint, (extract(epoch FROM now()) * 1000)::bigint
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'Classic Masala Maggi' AND category = 'maggi');

INSERT INTO products (public_id, name, description, category, price, tags, created_at, updated_at)
SELECT 'prd_seed_0030', 'Cheese Maggi', 'Gooey and rich.', 'maggi', 7, NULL, (extract(epoch FROM now()) * 1000)::bigint, (extract(epoch FROM now()) * 1000)::bigint
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'Cheese Maggi' AND category = 'maggi');

INSERT INTO products (public_id, name, description, category, price, tags, created_at, updated_at)
SELECT 'prd_seed_0031', 'Chicken Maggi', 'Protein-packed.', 'maggi', 9, NULL, (extract(epoch FROM now()) * 1000)::bigint, (extract(epoch FROM now()) * 1000)::bigint
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'Chicken Maggi' AND category = 'maggi');

INSERT INTO products (public_id, name, description, category, price, tags, created_at, updated_at)
SELECT 'prd_seed_0032', 'Bombay Veg Sandwich', 'Chutney, veg, masala.', 'sandwich', 7, NULL, (extract(epoch FROM now()) * 1000)::bigint, (extract(epoch FROM now()) * 1000)::bigint
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'Bombay Veg Sandwich' AND category = 'sandwich');

INSERT INTO products (public_id, name, description, category, price, tags, created_at, updated_at)
SELECT 'prd_seed_0033', 'Cheese Chilli Sandwich', 'Spicy & melty.', 'sandwich', 8, NULL, (extract(epoch FROM now()) * 1000)::bigint, (extract(epoch FROM now()) * 1000)::bigint
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'Cheese Chilli Sandwich' AND category = 'sandwich');

INSERT INTO products (public_id, name, description, category, price, tags, created_at, updated_at)
SELECT 'prd_seed_0034', 'Chicken Tikka Sandwich', 'Smoky tikka grilled.', 'sandwich', 9, NULL, (extract(epoch FROM now()) * 1000)::bigint, (extract(epoch FROM now()) * 1000)::bigint
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'Chicken Tikka Sandwich' AND category = 'sandwich');

INSERT INTO products (public_id, name, description, category, price, tags, created_at, updated_at)
SELECT 'prd_seed_0035', 'Masala Soda', 'Fizzy, tangy, spiced.', 'drinks', 5, ARRAY['new']::text[], (extract(epoch FROM now()) * 1000)::bigint, (extract(epoch FROM now()) * 1000)::bigint
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'Masala Soda' AND category = 'drinks');

INSERT INTO products (public_id, name, description, category, price, tags, created_at, updated_at)
SELECT 'prd_seed_0036', 'Rose Lassi', 'Creamy & floral.', 'drinks', 6, ARRAY['best']::text[], (extract(epoch FROM now()) * 1000)::bigint, (extract(epoch FROM now()) * 1000)::bigint
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'Rose Lassi' AND category = 'drinks');

INSERT INTO products (public_id, name, description, category, price, tags, created_at, updated_at)
SELECT 'prd_seed_0037', 'Aam Panna', 'Raw mango cooler.', 'drinks', 5, ARRAY['new']::text[], (extract(epoch FROM now()) * 1000)::bigint, (extract(epoch FROM now()) * 1000)::bigint
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'Aam Panna' AND category = 'drinks');

INSERT INTO products (public_id, name, description, category, price, tags, created_at, updated_at)
SELECT 'prd_seed_0038', 'Nimbu Pani', 'Classic lime soda.', 'drinks', 4, NULL, (extract(epoch FROM now()) * 1000)::bigint, (extract(epoch FROM now()) * 1000)::bigint
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'Nimbu Pani' AND category = 'drinks');

INSERT INTO products (public_id, name, description, category, price, tags, created_at, updated_at)
SELECT 'prd_seed_0039', 'Masala Chai', 'Brewed strong & spiced.', 'hot', 4, NULL, (extract(epoch FROM now()) * 1000)::bigint, (extract(epoch FROM now()) * 1000)::bigint
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'Masala Chai' AND category = 'hot');

INSERT INTO products (public_id, name, description, category, price, tags, created_at, updated_at)
SELECT 'prd_seed_0040', 'Filter Coffee', 'South-Indian style.', 'hot', 4, NULL, (extract(epoch FROM now()) * 1000)::bigint, (extract(epoch FROM now()) * 1000)::bigint
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'Filter Coffee' AND category = 'hot');

INSERT INTO products (public_id, name, description, category, price, tags, created_at, updated_at)
SELECT 'prd_seed_0041', 'Oreo Milkshake', 'Thick & loaded.', 'hot', 7, ARRAY['best']::text[], (extract(epoch FROM now()) * 1000)::bigint, (extract(epoch FROM now()) * 1000)::bigint
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'Oreo Milkshake' AND category = 'hot');

INSERT INTO products (public_id, name, description, category, price, tags, created_at, updated_at)
SELECT 'prd_seed_0042', 'Mango Milkshake', 'Seasonal favourite.', 'hot', 7, NULL, (extract(epoch FROM now()) * 1000)::bigint, (extract(epoch FROM now()) * 1000)::bigint
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'Mango Milkshake' AND category = 'hot');

INSERT INTO products (public_id, name, description, category, price, tags, created_at, updated_at)
SELECT 'prd_seed_0043', 'Puchka Party Box', '24 assorted puchkas + 2 waters.', 'combos', 22, ARRAY['best','viral']::text[], (extract(epoch FROM now()) * 1000)::bigint, (extract(epoch FROM now()) * 1000)::bigint
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'Puchka Party Box' AND category = 'combos');

INSERT INTO products (public_id, name, description, category, price, tags, created_at, updated_at)
SELECT 'prd_seed_0044', 'Roll + Drink Combo', 'Any kathi roll + a summer drink.', 'combos', 13, NULL, (extract(epoch FROM now()) * 1000)::bigint, (extract(epoch FROM now()) * 1000)::bigint
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'Roll + Drink Combo' AND category = 'combos');

INSERT INTO products (public_id, name, description, category, price, tags, created_at, updated_at)
SELECT 'prd_seed_0045', 'Fusion Sampler', '6 fusion puchkas, all flavours.', 'combos', 16, ARRAY['viral']::text[], (extract(epoch FROM now()) * 1000)::bigint, (extract(epoch FROM now()) * 1000)::bigint
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'Fusion Sampler' AND category = 'combos');

INSERT INTO products (public_id, name, description, category, price, tags, created_at, updated_at)
SELECT 'prd_seed_0046', 'Street Feast For 2', 'Puchkas + vada pav + momos + drinks.', 'combos', 32, ARRAY['best']::text[], (extract(epoch FROM now()) * 1000)::bigint, (extract(epoch FROM now()) * 1000)::bigint
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'Street Feast For 2' AND category = 'combos');

COMMIT;
