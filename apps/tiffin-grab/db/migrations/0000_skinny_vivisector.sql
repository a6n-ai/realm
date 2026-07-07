CREATE SEQUENCE IF NOT EXISTS "id_seq";--> statement-breakpoint
CREATE OR REPLACE FUNCTION next_id(OUT result bigint) RETURNS bigint LANGUAGE plpgsql AS $fn$
DECLARE our_epoch bigint := 1735689600000; seq_id bigint; now_millis bigint;
BEGIN
  SELECT nextval('id_seq') % 8388608 INTO seq_id;
  SELECT floor(extract(epoch FROM clock_timestamp()) * 1000) INTO now_millis;
  result := (now_millis - our_epoch) << 23;
  result := result | seq_id;
END;
$fn$;--> statement-breakpoint
-- Stub so CREATE TABLE app_id DEFAULTs validate; real body set after tables exist.
CREATE OR REPLACE FUNCTION current_app_id() RETURNS bigint LANGUAGE sql STABLE AS $fn$ SELECT NULL::bigint $fn$;--> statement-breakpoint
CREATE TYPE "public"."locale" AS ENUM('en', 'fr');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'member', 'user');--> statement-breakpoint
CREATE TYPE "public"."dish_diet" AS ENUM('veg', 'nonveg');--> statement-breakpoint
CREATE TYPE "public"."meal_diet" AS ENUM('veg', 'nonveg', 'both');--> statement-breakpoint
CREATE TYPE "public"."meal_tier" AS ENUM('budget', 'medium', 'premium');--> statement-breakpoint
CREATE TYPE "public"."plan_type" AS ENUM('tiffin', 'healthy');--> statement-breakpoint
CREATE TYPE "public"."order_activity_type" AS ENUM('created', 'status_change', 'paused', 'resumed', 'cancelled', 'activated', 'meal_pick', 'note');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pending', 'active', 'waitlisted', 'cancelled', 'paused');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('simulated', 'cash', 'etransfer', 'manual');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('simulated_paid', 'pending', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."coupon_kind" AS ENUM('percentage', 'fixed', 'free_delivery', 'first_order', 'rep_daily');--> statement-breakpoint
CREATE TYPE "public"."ledger_direction" AS ENUM('debit', 'credit');--> statement-breakpoint
CREATE TYPE "public"."ledger_entry_type" AS ENUM('payment', 'refund', 'discount', 'adjustment');--> statement-breakpoint
CREATE TYPE "public"."inquiry_activity_type" AS ENUM('created', 'note', 'stage_change', 'converted', 'call', 'whatsapp', 'email', 'quote_sent', 'sample_sent', 'payment_link_sent', 'visit', 'callback');--> statement-breakpoint
CREATE TYPE "public"."inquiry_lost_reason" AS ENUM('price', 'out_of_zone', 'no_response', 'chose_competitor', 'not_ready', 'other');--> statement-breakpoint
CREATE TYPE "public"."inquiry_stage" AS ENUM('new', 'contacted', 'quoted', 'follow_up', 'converted', 'lost');--> statement-breakpoint
CREATE TYPE "public"."ticket_category" AS ENUM('order', 'billing', 'catering', 'general');--> statement-breakpoint
CREATE TYPE "public"."ticket_message_author" AS ENUM('customer', 'staff', 'system');--> statement-breakpoint
CREATE TYPE "public"."ticket_priority" AS ENUM('low', 'normal', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."ticket_status" AS ENUM('open', 'in_progress', 'waiting_on_customer', 'resolved', 'closed');--> statement-breakpoint
CREATE TYPE "public"."day_of_week" AS ENUM('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun');--> statement-breakpoint
CREATE TYPE "public"."menu_week_status" AS ENUM('draft', 'released');--> statement-breakpoint
CREATE TYPE "public"."audit_operation" AS ENUM('create', 'update', 'delete', 'read', 'login', 'logout', 'login_failed');--> statement-breakpoint
CREATE TYPE "public"."app_event" AS ENUM('order_created', 'order_activated', 'order_completed', 'order_cancelled', 'order_paused', 'payment_received', 'refund_issued', 'menu_released', 'wallet_credited', 'wallet_redeemed', 'inquiry_created', 'inquiry_follow_up', 'inquiry_converted', 'ticket_created', 'ticket_reply', 'ticket_resolved', 'signup', 'manual_adjustment');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('email', 'in_app', 'sms', 'whatsapp');--> statement-breakpoint
CREATE TYPE "public"."notification_outbox_status" AS ENUM('pending', 'processing', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."file_resource_type" AS ENUM('static', 'secured');--> statement-breakpoint
CREATE TYPE "public"."file_system_node_type" AS ENUM('file', 'directory');--> statement-breakpoint
CREATE TABLE "feature_flags" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
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
	"id" text PRIMARY KEY DEFAULT (next_id())::text NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
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
	"id" text PRIMARY KEY DEFAULT (next_id())::text NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
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
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
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
	"password_set" boolean DEFAULT true NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"address_line" text,
	"address_unit" text,
	"city" text,
	"postal_code" text,
	"province" text,
	"dietary_notes" text,
	"allergens" text,
	"delivery_notes" text,
	"notify_email" boolean DEFAULT true NOT NULL,
	"notify_sms" boolean DEFAULT false NOT NULL,
	"locale" "locale" DEFAULT 'en' NOT NULL,
	"bauth_created_at" timestamp DEFAULT now() NOT NULL,
	"bauth_updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY DEFAULT (next_id())::text NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
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
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
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
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
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
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
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
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
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
CREATE TABLE "dishes" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"name" text NOT NULL,
	"description" text,
	"diet" "dish_diet" NOT NULL,
	"slots" text[] DEFAULT '{}' NOT NULL,
	"image" jsonb,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "dishes_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "duration_packages" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
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
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
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
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
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
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
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
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
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
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
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
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"order_id" bigint NOT NULL,
	"status" "payment_status" DEFAULT 'simulated_paid' NOT NULL,
	"method" "payment_method" DEFAULT 'simulated' NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"captured_at" bigint,
	"note" text,
	CONSTRAINT "payments_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "coupon_redemptions" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"coupon_id" bigint NOT NULL,
	"user_id" bigint NOT NULL,
	"order_id" bigint NOT NULL,
	"redeemed_by" bigint,
	"amount_applied" numeric(10, 2) NOT NULL,
	"context" jsonb,
	CONSTRAINT "coupon_redemptions_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "coupons" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"code" text NOT NULL,
	"kind" "coupon_kind" NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"value_pct" numeric(5, 2),
	"value_amount" numeric(10, 2),
	"cap_pct" numeric(5, 2),
	"cap_amount" numeric(10, 2),
	"min_subtotal" numeric(10, 2),
	"max_redemptions" integer,
	"max_per_user" integer,
	"redemption_count" integer DEFAULT 0 NOT NULL,
	"stackable" boolean DEFAULT false NOT NULL,
	"auto_apply" boolean DEFAULT false NOT NULL,
	"plan_types" text[] DEFAULT '{}' NOT NULL,
	"starts_at" bigint,
	"expires_at" bigint,
	"owner_user_id" bigint,
	"ist_date" text,
	"active" boolean DEFAULT true NOT NULL,
	"config" jsonb,
	CONSTRAINT "coupons_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "coupons_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"user_id" bigint NOT NULL,
	"order_id" bigint,
	"payment_id" bigint,
	"direction" "ledger_direction" NOT NULL,
	"type" "ledger_entry_type" NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"memo" text,
	CONSTRAINT "ledger_entries_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "inquiries" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
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
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"inquiry_id" bigint NOT NULL,
	"type" "inquiry_activity_type" NOT NULL,
	"note" text,
	"outcome" text,
	"amount" integer,
	"next_follow_up_at" bigint,
	"from_stage" "inquiry_stage",
	"to_stage" "inquiry_stage",
	CONSTRAINT "inquiry_activities_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "ticket_messages" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"ticket_id" bigint NOT NULL,
	"author_id" bigint NOT NULL,
	"author_type" "ticket_message_author" NOT NULL,
	"body" text NOT NULL,
	CONSTRAINT "ticket_messages_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"raised_by" bigint NOT NULL,
	"subject" text NOT NULL,
	"category" "ticket_category" NOT NULL,
	"status" "ticket_status" DEFAULT 'open' NOT NULL,
	"priority" "ticket_priority" DEFAULT 'normal' NOT NULL,
	"current_owner" bigint,
	"order_id" bigint,
	"closed_at" bigint,
	CONSTRAINT "tickets_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "lead_sources" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
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
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
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
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
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
CREATE TABLE "meal_selections" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
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
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"plan_type" "plan_type" DEFAULT 'tiffin' NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "meal_slots_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "menu_items" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"menu_week_id" bigint NOT NULL,
	"day_of_week" "day_of_week" NOT NULL,
	"slot" text NOT NULL,
	"dish_id" bigint NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "menu_items_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "menu_weeks" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"plan_type" "plan_type" DEFAULT 'tiffin' NOT NULL,
	"week_start" date NOT NULL,
	"status" "menu_week_status" DEFAULT 'draft' NOT NULL,
	"order_cutoff" bigint NOT NULL,
	"released_at" bigint,
	CONSTRAINT "menu_weeks_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "app" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"timezone" text DEFAULT 'America/Toronto' NOT NULL,
	"cutoff_hour" integer DEFAULT 18 NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"lead_assignment" jsonb,
	"meal_types" jsonb,
	"discount_policy" jsonb,
	CONSTRAINT "app_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"entity" text NOT NULL,
	"entity_public_id" text NOT NULL,
	"operation" "audit_operation" NOT NULL,
	"changes" jsonb,
	CONSTRAINT "audit_log_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "coin_rate" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"currency" text NOT NULL,
	"value_per_coin" numeric(10, 4) NOT NULL,
	CONSTRAINT "coin_rate_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "event_payout" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"event_type" "app_event" NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"coins" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "event_payout_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "event_payout_event_type_unique" UNIQUE("event_type")
);
--> statement-breakpoint
CREATE TABLE "wallet_ledger" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"user_id" bigint NOT NULL,
	"direction" "ledger_direction" NOT NULL,
	"event_type" "app_event",
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"coins" integer NOT NULL,
	"memo" text,
	"order_id" bigint,
	CONSTRAINT "wallet_ledger_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "notification_outbox" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"recipient_id" bigint NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"event" "app_event" NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "notification_outbox_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" bigint NOT NULL,
	"last_error" text,
	"provider_message_id" text,
	"dedupe_key" text,
	CONSTRAINT "notification_outbox_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "notification_prefs" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"user_id" bigint NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"suppressed" boolean DEFAULT false NOT NULL,
	"suppressed_reason" text,
	CONSTRAINT "notification_prefs_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"user_id" bigint NOT NULL,
	"event" "app_event" NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"href" text,
	"read_at" bigint,
	CONSTRAINT "notifications_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "notification_template" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"event" "app_event" NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"locale" "locale" NOT NULL,
	"subject" text NOT NULL,
	"body" text,
	"html" text,
	"text" text,
	"enabled" boolean DEFAULT true NOT NULL,
	CONSTRAINT "notification_template_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "files_file_system" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"resource_type" "file_resource_type" DEFAULT 'static' NOT NULL,
	"name" text NOT NULL,
	"file_type" "file_system_node_type" DEFAULT 'file' NOT NULL,
	"size" bigint,
	"parent_id" bigint,
	"path" text DEFAULT '' NOT NULL,
	CONSTRAINT "files_file_system_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "files_access_path" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"resource_type" "file_resource_type" DEFAULT 'static' NOT NULL,
	"access_name" text,
	"write_access" boolean DEFAULT false NOT NULL,
	"path" text DEFAULT '' NOT NULL,
	"allow_sub_path_access" boolean DEFAULT true NOT NULL,
	CONSTRAINT "files_access_path_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "files_secured_access_key" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"path" text NOT NULL,
	"access_key" text NOT NULL,
	"access_till" bigint NOT NULL,
	"access_limit" bigint,
	"accessed_count" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "files_secured_access_key_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "files_secured_access_key_access_key_unique" UNIQUE("access_key")
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
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_coupon_id_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_redeemed_by_users_id_fk" FOREIGN KEY ("redeemed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_source_id_lead_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."lead_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_sub_source_id_lead_subsources_id_fk" FOREIGN KEY ("sub_source_id") REFERENCES "public"."lead_subsources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_current_owner_users_id_fk" FOREIGN KEY ("current_owner") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_converted_order_id_orders_id_fk" FOREIGN KEY ("converted_order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_zone_id_delivery_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."delivery_zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiry_activities" ADD CONSTRAINT "inquiry_activities_inquiry_id_inquiries_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."inquiries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_raised_by_users_id_fk" FOREIGN KEY ("raised_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_current_owner_users_id_fk" FOREIGN KEY ("current_owner") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_subsources" ADD CONSTRAINT "lead_subsources_source_id_lead_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."lead_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiry_user_config" ADD CONSTRAINT "inquiry_user_config_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiry_user_config" ADD CONSTRAINT "inquiry_user_config_source_id_lead_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."lead_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_selections" ADD CONSTRAINT "meal_selections_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_selections" ADD CONSTRAINT "meal_selections_menu_week_id_menu_weeks_id_fk" FOREIGN KEY ("menu_week_id") REFERENCES "public"."menu_weeks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_selections" ADD CONSTRAINT "meal_selections_dish_id_dishes_id_fk" FOREIGN KEY ("dish_id") REFERENCES "public"."dishes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_menu_week_id_menu_weeks_id_fk" FOREIGN KEY ("menu_week_id") REFERENCES "public"."menu_weeks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_dish_id_dishes_id_fk" FOREIGN KEY ("dish_id") REFERENCES "public"."dishes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_ledger" ADD CONSTRAINT "wallet_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_ledger" ADD CONSTRAINT "wallet_ledger_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_prefs" ADD CONSTRAINT "notification_prefs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files_file_system" ADD CONSTRAINT "files_file_system_parent_id_files_file_system_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."files_file_system"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email") WHERE "users"."email" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "users_phone_unique" ON "users" USING btree ("phone") WHERE "users"."phone" is not null;--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "order_activities_order_created_idx" ON "order_activities" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_user_created_idx" ON "orders" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "payments_order_idx" ON "payments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "coupon_redemptions_coupon_idx" ON "coupon_redemptions" USING btree ("coupon_id");--> statement-breakpoint
CREATE INDEX "coupon_redemptions_user_idx" ON "coupon_redemptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "coupon_redemptions_order_idx" ON "coupon_redemptions" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "coupons_kind_active_idx" ON "coupons" USING btree ("kind","active");--> statement-breakpoint
CREATE UNIQUE INDEX "coupons_rep_daily_unq" ON "coupons" USING btree ("owner_user_id","ist_date") WHERE "coupons"."kind" = 'rep_daily';--> statement-breakpoint
CREATE INDEX "ledger_user_created_idx" ON "ledger_entries" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "ledger_order_idx" ON "ledger_entries" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "inquiries_phone_lower_idx" ON "inquiries" USING btree (lower("phone"));--> statement-breakpoint
CREATE INDEX "inquiries_email_lower_idx" ON "inquiries" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "inquiries_owner_idx" ON "inquiries" USING btree ("current_owner");--> statement-breakpoint
CREATE UNIQUE INDEX "inquiries_open_phone_source_uq" ON "inquiries" USING btree (lower("phone"),"source_id") WHERE "inquiries"."stage" not in ('converted', 'lost');--> statement-breakpoint
CREATE INDEX "inquiry_activities_inquiry_created_idx" ON "inquiry_activities" USING btree ("inquiry_id","created_at");--> statement-breakpoint
CREATE INDEX "ticket_messages_ticket_created_idx" ON "ticket_messages" USING btree ("ticket_id","created_at");--> statement-breakpoint
CREATE INDEX "tickets_raised_by_idx" ON "tickets" USING btree ("raised_by");--> statement-breakpoint
CREATE INDEX "tickets_owner_idx" ON "tickets" USING btree ("current_owner");--> statement-breakpoint
CREATE INDEX "tickets_status_idx" ON "tickets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "lead_subsources_source_idx" ON "lead_subsources" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "inquiry_user_config_source_idx" ON "inquiry_user_config" USING btree ("source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "meal_selections_unique" ON "meal_selections" USING btree ("order_id","menu_week_id","day_of_week","slot","person_index");--> statement-breakpoint
CREATE UNIQUE INDEX "meal_slots_type_key_unique" ON "meal_slots" USING btree ("plan_type","key");--> statement-breakpoint
CREATE UNIQUE INDEX "menu_items_unique" ON "menu_items" USING btree ("menu_week_id","day_of_week","slot","dish_id");--> statement-breakpoint
CREATE UNIQUE INDEX "menu_weeks_type_week_unique" ON "menu_weeks" USING btree ("plan_type","week_start");--> statement-breakpoint
CREATE INDEX "coin_rate_currency_created_idx" ON "coin_rate" USING btree ("currency","created_at");--> statement-breakpoint
CREATE INDEX "wallet_user_created_idx" ON "wallet_ledger" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_earn_idempotent_idx" ON "wallet_ledger" USING btree ("source_type","source_id","event_type");--> statement-breakpoint
CREATE INDEX "notification_outbox_due_idx" ON "notification_outbox" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_outbox_dedupe_idx" ON "notification_outbox" USING btree ("dedupe_key");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_prefs_user_channel_idx" ON "notification_prefs" USING btree ("user_id","channel");--> statement-breakpoint
CREATE INDEX "notifications_user_created_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_template_key_idx" ON "notification_template" USING btree ("event","channel","locale");--> statement-breakpoint
CREATE INDEX "idx_fs_rtype_ftype_parent" ON "files_file_system" USING btree ("resource_type","file_type","parent_id");--> statement-breakpoint
CREATE INDEX "idx_fs_rtype_ftype" ON "files_file_system" USING btree ("resource_type","file_type");--> statement-breakpoint
CREATE INDEX "idx_fs_path" ON "files_file_system" USING btree ("path");
--> statement-breakpoint
-- Real singleton resolver (app table now exists).
CREATE OR REPLACE FUNCTION current_app_id() RETURNS bigint LANGUAGE sql STABLE AS $fn$ SELECT id FROM app ORDER BY id LIMIT 1 $fn$;--> statement-breakpoint
-- app_id FK on every table (appId has no .references in schema to avoid an import cycle).
DO $do$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_' || t || '_app') THEN
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (app_id) REFERENCES app(id)', t, 'fk_' || t || '_app');
    END IF;
  END LOOP;
END
$do$;
