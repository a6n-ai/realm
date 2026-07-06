ALTER TABLE "account" ALTER COLUMN "id" SET DEFAULT (next_id())::text;--> statement-breakpoint
ALTER TABLE "session" ALTER COLUMN "id" SET DEFAULT (next_id())::text;--> statement-breakpoint
ALTER TABLE "verification" ALTER COLUMN "id" SET DEFAULT (next_id())::text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_set" boolean DEFAULT true NOT NULL;