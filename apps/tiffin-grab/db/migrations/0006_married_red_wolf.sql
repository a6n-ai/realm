ALTER TYPE "public"."order_activity_type" ADD VALUE 'pool_scheduled';--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "pooled_tiffin_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN "pooled_at" bigint;