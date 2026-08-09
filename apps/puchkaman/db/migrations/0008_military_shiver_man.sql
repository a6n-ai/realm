ALTER TABLE "discounts" ADD COLUMN "starts_at" bigint;--> statement-breakpoint
ALTER TABLE "discounts" ADD COLUMN "expires_at" bigint;--> statement-breakpoint
ALTER TABLE "discounts" ADD COLUMN "min_subtotal" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "discounts" ADD COLUMN "stackable" boolean DEFAULT true NOT NULL;