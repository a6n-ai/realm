ALTER TABLE "delivery_charge_configs" ADD COLUMN IF NOT EXISTS "app_id" bigint DEFAULT current_app_id() NOT NULL;
--> statement-breakpoint
ALTER TABLE "delivery_types" ADD COLUMN IF NOT EXISTS "app_id" bigint DEFAULT current_app_id() NOT NULL;
--> statement-breakpoint
ALTER TABLE "address_tags" ADD COLUMN IF NOT EXISTS "app_id" bigint DEFAULT current_app_id() NOT NULL;
