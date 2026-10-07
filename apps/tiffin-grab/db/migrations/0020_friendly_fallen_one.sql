ALTER TYPE "public"."order_activity_type" ADD VALUE 'complimentary_granted';--> statement-breakpoint
ALTER TYPE "public"."app_event" ADD VALUE 'order_complimentary';--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "complimentary_tiffins" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN "complimentary_note" text;