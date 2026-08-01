-- The menu builder used to collapse Saturday and Sunday into one "Weekends" column and
-- store every weekend dish under 'sat'. Readers key on the real weekday, so any order with
-- include_sunday resolved Sunday to an empty meal. The builder now writes both days.
--
-- The existing 'sat' rows are not wrong, they are under-keyed: the admin entered them
-- meaning "the weekend menu". So copy them to 'sun' rather than moving them. Weeks that
-- already carry genuine 'sun' rows are left exactly as they are.
--
-- public_id is normally minted by the app (nanoid), so it is derived here from the source
-- row id: unique because src.id is, and stable so a re-run cannot mint a second variant.
-- id and app_id are omitted on purpose — next_id() and current_app_id() are the defaults.
INSERT INTO menu_items (public_id, menu_week_id, day_of_week, slot, dish_id, is_default, position, created_at, created_by, updated_at, updated_by)
SELECT
  'mni_' || substr(md5(src.id::text), 1, 12),
  src.menu_week_id,
  'sun',
  src.slot,
  src.dish_id,
  src.is_default,
  src.position,
  src.created_at,
  src.created_by,
  src.updated_at,
  src.updated_by
FROM menu_items src
WHERE src.day_of_week = 'sat'
  AND NOT EXISTS (
    SELECT 1 FROM menu_items dst
    WHERE dst.menu_week_id = src.menu_week_id
      AND dst.day_of_week = 'sun'
  );
