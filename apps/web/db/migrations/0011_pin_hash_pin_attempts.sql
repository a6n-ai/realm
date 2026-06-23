ALTER TABLE "users" ADD COLUMN "pin_hash" text;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "pin_attempts" integer DEFAULT 0 NOT NULL;