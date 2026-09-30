ALTER TABLE "orders" ADD COLUMN "trial_length" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "trial_weekdays" text[];--> statement-breakpoint
ALTER TABLE "app" ADD COLUMN "trial_max_days" integer;--> statement-breakpoint
ALTER TABLE "app" ADD COLUMN "trial_weekdays" text[] DEFAULT '{}' NOT NULL;