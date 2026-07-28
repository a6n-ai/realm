ALTER TYPE "public"."order_fulfillment" ADD VALUE 'delivery_instant';--> statement-breakpoint
ALTER TYPE "public"."order_fulfillment" ADD VALUE 'delivery_scheduled';--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivery_address" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivery_lat" numeric(9, 6);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivery_lng" numeric(9, 6);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivery_distance_km" numeric(6, 2);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "scheduled_for" bigint;