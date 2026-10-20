ALTER TABLE "payments" ADD COLUMN "expires_at" bigint;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "addon_request" jsonb;