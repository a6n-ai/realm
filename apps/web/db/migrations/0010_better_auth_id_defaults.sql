-- Add Postgres-generated UUIDs as defaults for the three Better Auth text id columns.
-- gen_random_uuid() is built into Postgres 13+ (no pgcrypto extension needed).
-- Required because the better-auth config uses generateId: false (the DB generates ids),
-- and the session/account/verification id columns are text PKs with no other default.
ALTER TABLE "account" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
--> statement-breakpoint
ALTER TABLE "session" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
--> statement-breakpoint
ALTER TABLE "verification" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;

-- NOTE: this migration intentionally does NOT drop users.password_hash.
-- Dropping it here would let `db:migrate` (which applies all pending migrations in
-- one pass) destroy the credential source BEFORE the `db:migrate:passwords` backfill
-- runs. The column is left in place (unused by the Drizzle schema) and is dropped by
-- a SEPARATE future migration, authored only after the backfill is confirmed in
-- production. Runbook:
--   1. Apply migrations through 0010 (creates BA tables + id defaults; password_hash kept).
--   2. Run `db:migrate:passwords` (idempotent — copies password_hash -> credential account
--      rows, skipping users that already have one).
--   3. Verify account rows exist for all credentialed users.
--   4. THEN author + apply a 0011 migration dropping users.password_hash.
