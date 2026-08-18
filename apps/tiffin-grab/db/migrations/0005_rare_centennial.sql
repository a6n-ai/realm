ALTER TABLE "organization" ADD COLUMN "timezone" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "cutoff_hour" integer;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "default_max_pauses" integer;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "default_max_pause_days_total" integer;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "default_max_pause_stretch_days" integer;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "currency" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "default_country" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "lead_assignment" jsonb;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "meal_types" jsonb;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "discount_policy" jsonb;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "payment_config" jsonb;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "integrations_config" jsonb;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "max_wallet_balance" integer;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "is_default_location" boolean DEFAULT false NOT NULL;