-- better-auth's session/account/verification rows have text `id`s filled by the
-- DB default (generateId:false). Switch that default from gen_random_uuid()::text
-- to next_id()::text so new auth rows share the platform's one id scheme. Column
-- stays text (better-auth treats id as an opaque string); existing rows keep
-- their uuid ids. No FK references these ids, so nothing else changes.
ALTER TABLE "session" ALTER COLUMN "id" SET DEFAULT (next_id())::text;--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "id" SET DEFAULT (next_id())::text;--> statement-breakpoint
ALTER TABLE "verification" ALTER COLUMN "id" SET DEFAULT (next_id())::text;
