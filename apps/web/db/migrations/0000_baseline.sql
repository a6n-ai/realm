CREATE SEQUENCE IF NOT EXISTS id_seq;--> statement-breakpoint
CREATE OR REPLACE FUNCTION next_id(OUT result bigint) AS $$
DECLARE
  our_epoch  bigint := 1735689600000;
  seq_id     bigint;
  now_millis bigint;
  shard_id   int := 1;
BEGIN
  SELECT nextval('id_seq') % 1024 INTO seq_id;
  SELECT floor(extract(epoch FROM clock_timestamp()) * 1000) INTO now_millis;
  result := (now_millis - our_epoch) << 23;
  result := result | (shard_id << 10);
  result := result | seq_id;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'member', 'user');--> statement-breakpoint
CREATE TYPE "public"."meal_diet" AS ENUM('veg', 'nonveg', 'both');--> statement-breakpoint
CREATE TYPE "public"."meal_tier" AS ENUM('budget', 'medium', 'premium');--> statement-breakpoint
CREATE TYPE "public"."plan_type" AS ENUM('tiffin', 'healthy');--> statement-breakpoint
CREATE TYPE "public"."order_activity_type" AS ENUM('created', 'status_change', 'paused', 'resumed', 'cancelled', 'activated', 'meal_pick', 'note');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pending', 'active', 'waitlisted', 'cancelled', 'paused');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('simulated_paid');--> statement-breakpoint
CREATE TYPE "public"."inquiry_activity_type" AS ENUM('created', 'note', 'stage_change', 'converted', 'call', 'whatsapp', 'email');--> statement-breakpoint
CREATE TYPE "public"."inquiry_lost_reason" AS ENUM('price', 'out_of_zone', 'no_response', 'chose_competitor', 'not_ready', 'other');--> statement-breakpoint
CREATE TYPE "public"."inquiry_stage" AS ENUM('new', 'contacted', 'follow_up', 'converted', 'lost');--> statement-breakpoint
CREATE TYPE "public"."day_of_week" AS ENUM('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun');--> statement-breakpoint
CREATE TYPE "public"."dish_diet" AS ENUM('veg', 'nonveg');--> statement-breakpoint
CREATE TYPE "public"."menu_week_status" AS ENUM('draft', 'released');--> statement-breakpoint
CREATE TYPE "public"."audit_operation" AS ENUM('create', 'update', 'delete');--> statement-breakpoint
CREATE TABLE "feature_flags" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"default_enabled" boolean DEFAULT false NOT NULL,
	CONSTRAINT "feature_flags_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "feature_flags_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"public_id" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" bigint NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "account_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"public_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "session_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"name" text,
	"email" text,
	"email_verified" boolean DEFAULT false NOT NULL,
	"phone_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"phone" text,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"pin_hash" text,
	"pin_attempts" integer DEFAULT 0 NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"bauth_created_at" timestamp DEFAULT now() NOT NULL,
	"bauth_updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"public_id" text NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "verification_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "user_feature_flags" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"user_id" bigint NOT NULL,
	"flag_id" bigint NOT NULL,
	"enabled" boolean NOT NULL,
	CONSTRAINT "user_feature_flags_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "user_feature_flags_user_flag_uq" UNIQUE("user_id","flag_id")
);
--> statement-breakpoint
CREATE TABLE "addons" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"price_per_week" numeric(10, 2) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "addons_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "addons_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "delivery_frequencies" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"days_per_week" integer NOT NULL,
	"courier_discount_pct" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "delivery_frequencies_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "delivery_frequencies_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "delivery_zones" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"name" text NOT NULL,
	"postal_prefixes" text[] NOT NULL,
	"slot_window" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "delivery_zones_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "delivery_zones_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "duration_packages" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"weeks" integer NOT NULL,
	"discount_pct" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "duration_packages_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "duration_packages_weeks_unique" UNIQUE("weeks")
);
--> statement-breakpoint
CREATE TABLE "meal_sizes" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
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
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "meal_sizes_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "meal_sizes_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"plan_type" "plan_type" DEFAULT 'tiffin' NOT NULL,
	"offered_slots" text[] DEFAULT '{}' NOT NULL,
	"allowed_start_days" text[] DEFAULT '{"mon","tue","wed","thu","fri"}' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "plans_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "plans_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "pricing_tiers" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"min_qty" integer NOT NULL,
	"max_qty" integer,
	"uplift_pct" numeric(5, 2) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "pricing_tiers_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "order_activities" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"order_id" bigint NOT NULL,
	"type" "order_activity_type" NOT NULL,
	"note" text,
	"from_status" "order_status",
	"to_status" "order_status",
	CONSTRAINT "order_activities_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"user_id" bigint,
	"current_owner" bigint,
	"plan_id" bigint NOT NULL,
	"meal_size_id" bigint NOT NULL,
	"frequency_id" bigint NOT NULL,
	"persons" integer DEFAULT 1 NOT NULL,
	"meal_slots" text[] DEFAULT '{"lunch"}' NOT NULL,
	"include_saturday" boolean DEFAULT false NOT NULL,
	"include_sunday" boolean DEFAULT false NOT NULL,
	"duration_weeks" integer NOT NULL,
	"start_date" date NOT NULL,
	"tiffin_count" integer NOT NULL,
	"per_tiffin_price" numeric(10, 2) NOT NULL,
	"pricing_snapshot" jsonb NOT NULL,
	"total" numeric(10, 2) NOT NULL,
	"status" "order_status" DEFAULT 'pending' NOT NULL,
	"paused_from" date,
	"paused_until" date,
	"deployment_id" text NOT NULL,
	"zone_id" bigint,
	"full_name" text NOT NULL,
	"address_line" text NOT NULL,
	"city" text NOT NULL,
	"postal_code" text NOT NULL,
	CONSTRAINT "orders_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "orders_deployment_id_unique" UNIQUE("deployment_id")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"order_id" bigint NOT NULL,
	"status" "payment_status" DEFAULT 'simulated_paid' NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	CONSTRAINT "payments_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "inquiries" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"full_name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"source_id" bigint NOT NULL,
	"sub_source_id" bigint,
	"stage" "inquiry_stage" DEFAULT 'new' NOT NULL,
	"current_owner" bigint,
	"converted_order_id" bigint,
	"plan_interest" text,
	"meal_size_interest" text,
	"persons_interest" integer,
	"postal_code" text,
	"zone_id" bigint,
	"preferred_start" date,
	"quoted_price" numeric(10, 2),
	"lost_reason" "inquiry_lost_reason",
	"notes" text,
	CONSTRAINT "inquiries_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "inquiry_activities" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"inquiry_id" bigint NOT NULL,
	"type" "inquiry_activity_type" NOT NULL,
	"note" text,
	"outcome" text,
	"next_follow_up_at" bigint,
	"from_stage" "inquiry_stage",
	"to_stage" "inquiry_stage",
	CONSTRAINT "inquiry_activities_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "lead_sources" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"is_inbound" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "lead_sources_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "lead_sources_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "lead_subsources" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"source_id" bigint NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "lead_subsources_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "inquiry_user_config" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"user_id" bigint NOT NULL,
	"source_id" bigint,
	"weight" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "inquiry_user_config_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "inquiry_user_config_user_source_unq" UNIQUE("user_id","source_id")
);
--> statement-breakpoint
CREATE TABLE "dishes" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"name" text NOT NULL,
	"description" text,
	"diet" "dish_diet" NOT NULL,
	"slots" text[] DEFAULT '{}' NOT NULL,
	"image_url" text,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "dishes_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "meal_selections" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"order_id" bigint NOT NULL,
	"menu_week_id" bigint NOT NULL,
	"day_of_week" "day_of_week" NOT NULL,
	"slot" text NOT NULL,
	"person_index" integer NOT NULL,
	"dish_id" bigint NOT NULL,
	CONSTRAINT "meal_selections_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "meal_slots" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "meal_slots_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "meal_slots_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "menu_items" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"menu_week_id" bigint NOT NULL,
	"day_of_week" "day_of_week" NOT NULL,
	"slot" text NOT NULL,
	"dish_id" bigint NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	CONSTRAINT "menu_items_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "menu_weeks" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"week_start" date NOT NULL,
	"status" "menu_week_status" DEFAULT 'draft' NOT NULL,
	"order_cutoff" bigint NOT NULL,
	"released_at" bigint,
	CONSTRAINT "menu_weeks_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "menu_weeks_week_start_unique" UNIQUE("week_start")
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"timezone" text DEFAULT 'America/Toronto' NOT NULL,
	"cutoff_hour" integer DEFAULT 18 NOT NULL,
	"lead_assignment" jsonb,
	CONSTRAINT "app_settings_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"entity" text NOT NULL,
	"entity_public_id" text NOT NULL,
	"operation" "audit_operation" NOT NULL,
	"changes" jsonb,
	CONSTRAINT "audit_log_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_feature_flags" ADD CONSTRAINT "user_feature_flags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_feature_flags" ADD CONSTRAINT "user_feature_flags_flag_id_feature_flags_id_fk" FOREIGN KEY ("flag_id") REFERENCES "public"."feature_flags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_activities" ADD CONSTRAINT "order_activities_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_current_owner_users_id_fk" FOREIGN KEY ("current_owner") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_meal_size_id_meal_sizes_id_fk" FOREIGN KEY ("meal_size_id") REFERENCES "public"."meal_sizes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_frequency_id_delivery_frequencies_id_fk" FOREIGN KEY ("frequency_id") REFERENCES "public"."delivery_frequencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_zone_id_delivery_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."delivery_zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_source_id_lead_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."lead_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_sub_source_id_lead_subsources_id_fk" FOREIGN KEY ("sub_source_id") REFERENCES "public"."lead_subsources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_current_owner_users_id_fk" FOREIGN KEY ("current_owner") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_converted_order_id_orders_id_fk" FOREIGN KEY ("converted_order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_zone_id_delivery_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."delivery_zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiry_activities" ADD CONSTRAINT "inquiry_activities_inquiry_id_inquiries_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."inquiries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_subsources" ADD CONSTRAINT "lead_subsources_source_id_lead_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."lead_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiry_user_config" ADD CONSTRAINT "inquiry_user_config_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiry_user_config" ADD CONSTRAINT "inquiry_user_config_source_id_lead_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."lead_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_selections" ADD CONSTRAINT "meal_selections_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_selections" ADD CONSTRAINT "meal_selections_menu_week_id_menu_weeks_id_fk" FOREIGN KEY ("menu_week_id") REFERENCES "public"."menu_weeks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_selections" ADD CONSTRAINT "meal_selections_dish_id_dishes_id_fk" FOREIGN KEY ("dish_id") REFERENCES "public"."dishes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_menu_week_id_menu_weeks_id_fk" FOREIGN KEY ("menu_week_id") REFERENCES "public"."menu_weeks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_dish_id_dishes_id_fk" FOREIGN KEY ("dish_id") REFERENCES "public"."dishes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email") WHERE "users"."email" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "users_phone_unique" ON "users" USING btree ("phone") WHERE "users"."phone" is not null;--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "inquiries_phone_lower_idx" ON "inquiries" USING btree (lower("phone"));--> statement-breakpoint
CREATE INDEX "inquiries_email_lower_idx" ON "inquiries" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "inquiries_owner_idx" ON "inquiries" USING btree ("current_owner");--> statement-breakpoint
CREATE UNIQUE INDEX "inquiries_open_phone_source_uq" ON "inquiries" USING btree (lower("phone"),"source_id") WHERE "inquiries"."stage" not in ('converted', 'lost');--> statement-breakpoint
CREATE INDEX "lead_subsources_source_idx" ON "lead_subsources" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "inquiry_user_config_source_idx" ON "inquiry_user_config" USING btree ("source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "meal_selections_unique" ON "meal_selections" USING btree ("order_id","menu_week_id","day_of_week","slot","person_index");--> statement-breakpoint
CREATE UNIQUE INDEX "menu_items_unique" ON "menu_items" USING btree ("menu_week_id","day_of_week","slot","dish_id");