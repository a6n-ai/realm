CREATE TYPE "public"."payment_status" AS ENUM('simulated_paid');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('pending', 'active', 'waitlisted', 'cancelled');--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"subscription_id" uuid NOT NULL,
	"status" "payment_status" DEFAULT 'simulated_paid' NOT NULL,
	"amount" numeric(10, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"user_id" uuid,
	"plan_id" uuid NOT NULL,
	"meal_size_id" uuid NOT NULL,
	"frequency_id" uuid NOT NULL,
	"daily_qty" integer DEFAULT 1 NOT NULL,
	"include_saturday" boolean DEFAULT false NOT NULL,
	"include_sunday" boolean DEFAULT false NOT NULL,
	"is_student" boolean DEFAULT false NOT NULL,
	"duration_weeks" integer NOT NULL,
	"pricing_snapshot" jsonb NOT NULL,
	"weekly_fee" numeric(10, 2) NOT NULL,
	"total" numeric(10, 2) NOT NULL,
	"status" "subscription_status" DEFAULT 'pending' NOT NULL,
	"deployment_id" text NOT NULL,
	"zone_id" uuid,
	"full_name" text NOT NULL,
	"address_line" text NOT NULL,
	"city" text NOT NULL,
	"postal_code" text NOT NULL,
	CONSTRAINT "subscriptions_deployment_id_unique" UNIQUE("deployment_id")
);
--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_meal_size_id_meal_sizes_id_fk" FOREIGN KEY ("meal_size_id") REFERENCES "public"."meal_sizes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_frequency_id_delivery_frequencies_id_fk" FOREIGN KEY ("frequency_id") REFERENCES "public"."delivery_frequencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_zone_id_delivery_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."delivery_zones"("id") ON DELETE no action ON UPDATE no action;