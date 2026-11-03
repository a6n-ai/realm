ALTER TABLE "orders" ADD COLUMN "meta_attribution" jsonb;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "meta_purchase_eligible" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "meta_purchase_sent_at" bigint;