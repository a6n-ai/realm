CREATE TYPE "public"."meal_size_discount_type" AS ENUM('none', 'percent', 'flat');--> statement-breakpoint
ALTER TABLE "meal_sizes" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "meal_sizes" ADD COLUMN "discount_type" "meal_size_discount_type" DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "meal_sizes" ADD COLUMN "discount_value" numeric(10, 2) DEFAULT '0' NOT NULL;