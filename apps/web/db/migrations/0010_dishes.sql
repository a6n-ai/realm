CREATE TYPE "public"."dish_diet" AS ENUM('veg', 'nonveg');--> statement-breakpoint
CREATE TABLE "dishes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"name" text NOT NULL,
	"description" text,
	"diet" "dish_diet" NOT NULL,
	"slots" text[] DEFAULT '{}' NOT NULL,
	"image_url" text,
	"active" boolean DEFAULT true NOT NULL
);
