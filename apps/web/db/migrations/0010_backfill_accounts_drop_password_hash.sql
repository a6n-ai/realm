-- Runbook order (MUST be followed exactly):
--   1. Apply 0009_better_auth.sql (Task 2) — creates account/session/verification tables
--   2. Run `db:migrate:passwords` (Task 4 backfill) — copies password_hash → account rows
--   3. Apply THIS migration (0010) — adds id defaults + drops password_hash
-- Dropping password_hash BEFORE step 2 would destroy the source data for the backfill.

--> statement-breakpoint

-- Add Postgres-generated UUIDs as defaults for the three Better Auth text id columns.
-- gen_random_uuid() is built into Postgres 13+ (no pgcrypto extension needed).
-- This is required because better-auth config uses generateId: false (DB generates ids).
ALTER TABLE "account" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
--> statement-breakpoint
ALTER TABLE "session" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
--> statement-breakpoint
ALTER TABLE "verification" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
--> statement-breakpoint

-- Drop password_hash from users (backfill to account table must run first — see runbook above).
ALTER TABLE "users" DROP COLUMN "password_hash";
