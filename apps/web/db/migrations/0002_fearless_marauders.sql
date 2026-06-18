CREATE TYPE "public"."meal_diet" AS ENUM('veg', 'nonveg', 'both');--> statement-breakpoint
CREATE TYPE "public"."meal_tier" AS ENUM('budget', 'medium', 'premium');--> statement-breakpoint
CREATE TABLE "addons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"price_per_week" numeric(10, 2) NOT NULL,
	CONSTRAINT "addons_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "delivery_frequencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"days_per_week" integer NOT NULL,
	"courier_discount_pct" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "delivery_frequencies_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "delivery_zones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"name" text NOT NULL,
	"postal_prefixes" text[] NOT NULL,
	"slot_window" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "duration_packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"weeks" integer NOT NULL,
	"discount_pct" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "duration_packages_weeks_unique" UNIQUE("weeks")
);
--> statement-breakpoint
CREATE TABLE "meal_sizes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"tier" "meal_tier" NOT NULL,
	"diet" "meal_diet" NOT NULL,
	"components" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"kcal_min" integer NOT NULL,
	"kcal_max" integer NOT NULL,
	"protein_g" integer,
	"carbs_g" integer,
	"fat_g" integer,
	"base_price" numeric(10, 2) NOT NULL,
	CONSTRAINT "meal_sizes_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	CONSTRAINT "plans_key_unique" UNIQUE("key")
);
