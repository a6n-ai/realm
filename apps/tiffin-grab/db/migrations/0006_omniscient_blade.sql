ALTER TYPE "public"."order_activity_type" ADD VALUE 'route_completed';--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN "optimo_completion_status" text;--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN "optimo_completed_at" bigint;--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN "optimo_completion_note" text;