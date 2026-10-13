ALTER TABLE "subscription_pauses" ADD COLUMN "delivery_dates" text[];--> statement-breakpoint
ALTER TABLE "subscription_pauses" ADD COLUMN "released_dates" text[] DEFAULT '{}'::text[] NOT NULL;