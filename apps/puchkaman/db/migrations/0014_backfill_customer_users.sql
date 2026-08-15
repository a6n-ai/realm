-- Provision a customer users row for every distinct order email that does not
-- already have an account, then link the orders to it.
--
-- Idempotent: the insert skips addresses that already exist (including staff
-- accounts, which must keep their role), and the update only fills a null
-- user_id. Safe to re-run.
--
-- DISTINCT ON ... ORDER BY created_at DESC takes the MOST RECENT name and phone
-- for a repeat customer, which is the one most likely to still be correct.
--
-- public_id, created_at and updated_at are generated here because they are
-- drizzle $defaultFn values (application-side), not DB defaults — a plain
-- INSERT would violate their NOT NULL constraints.
INSERT INTO "users" (
  "public_id", "created_at", "updated_at",
  "email", "name", "phone", "role", "status", "password_set"
)
SELECT DISTINCT ON (lower(o."customer_email"))
       'usr_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
       (extract(epoch from now()) * 1000)::bigint,
       (extract(epoch from now()) * 1000)::bigint,
       lower(o."customer_email"),
       o."customer_name",
       o."customer_phone",
       'user',
       'active',
       false
FROM "orders" o
WHERE o."customer_email" IS NOT NULL
  AND o."customer_email" <> ''
ORDER BY lower(o."customer_email"), o."created_at" DESC
-- Repeats the partial index predicate: Postgres will not infer a partial
-- unique index without it.
ON CONFLICT ("email") WHERE "email" IS NOT NULL DO NOTHING;
--> statement-breakpoint
UPDATE "orders" o
SET "user_id" = u."id"
FROM "users" u
WHERE o."user_id" IS NULL
  AND u."email" = lower(o."customer_email");
