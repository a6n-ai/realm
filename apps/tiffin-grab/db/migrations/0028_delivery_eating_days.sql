ALTER TABLE "orders" ADD COLUMN "eating_days" text[];--> statement-breakpoint
ALTER TABLE "app" ADD COLUMN "min_tiffins_per_week" integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "app" ADD COLUMN "max_tiffins_per_week" integer DEFAULT 7 NOT NULL;