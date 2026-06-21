CREATE TYPE "public"."plan_type" AS ENUM('tiffin', 'healthy');--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "plan_type" "plan_type" DEFAULT 'tiffin' NOT NULL;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "offered_slots" text[] DEFAULT '{}' NOT NULL;