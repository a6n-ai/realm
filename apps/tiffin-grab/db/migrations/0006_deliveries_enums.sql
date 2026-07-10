ALTER TYPE "public"."order_status" ADD VALUE IF NOT EXISTS 'completed';--> statement-breakpoint
ALTER TYPE "public"."order_activity_type" ADD VALUE IF NOT EXISTS 'skipped';--> statement-breakpoint
ALTER TYPE "public"."order_activity_type" ADD VALUE IF NOT EXISTS 'unskipped';--> statement-breakpoint
ALTER TYPE "public"."order_activity_type" ADD VALUE IF NOT EXISTS 'delivery_address_changed';
