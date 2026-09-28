-- Squashed baseline. Replaces the entire pre-launch migration chain (0000..0063) as of
-- 2026-09-27; verified schema-equivalent to that chain (plus schema.ts FKs it never created).
--
-- The sequence, next_id()/current_app_id() and the app_id foreign-key loop are hand-written:
-- drizzle-kit generate does NOT emit them, so they are spliced back around the generated
-- body every time this file is regenerated. Dropping them yields a schema whose CREATE TABLE
-- defaults reference functions that do not exist, and an idempotence check will not catch it.
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
CREATE TYPE "public"."user_status" AS ENUM('active', 'inactive', 'suspended', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."meal_tier" AS ENUM('budget', 'medium', 'premium');--> statement-breakpoint
CREATE TYPE "public"."plan_type" AS ENUM('tiffin', 'healthy');--> statement-breakpoint
CREATE TYPE "public"."order_activity_type" AS ENUM('created', 'status_change', 'paused', 'resumed', 'cancelled', 'activated', 'meal_pick', 'note', 'skipped', 'unskipped', 'delivery_address_changed', 'pool_scheduled', 'payment_claimed', 'payment_verified', 'payment_rejected', 'route_pushed', 'route_completed', 'category_swap_applied', 'category_swap_removed');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pending', 'active', 'waitlisted', 'cancelled', 'paused', 'completed');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('simulated', 'cash', 'etransfer', 'manual');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('simulated_paid', 'pending', 'refunded', 'awaiting_payment', 'pending_verification', 'paid', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."delivery_status" AS ENUM('scheduled', 'paused', 'skipped', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."coupon_kind" AS ENUM('percentage', 'fixed', 'free_delivery', 'first_order', 'rep_daily');--> statement-breakpoint
CREATE TYPE "public"."ledger_direction" AS ENUM('debit', 'credit');--> statement-breakpoint
CREATE TYPE "public"."ledger_entry_type" AS ENUM('payment', 'refund', 'discount', 'adjustment');--> statement-breakpoint
CREATE TYPE "public"."inquiry_activity_type" AS ENUM('created', 'note', 'stage_change', 'converted', 'call', 'whatsapp', 'email', 'quote_sent', 'sample_sent', 'payment_link_sent', 'visit', 'callback');--> statement-breakpoint
CREATE TYPE "public"."inquiry_lost_reason" AS ENUM('price', 'out_of_zone', 'no_response', 'chose_competitor', 'not_ready', 'other');--> statement-breakpoint
CREATE TYPE "public"."inquiry_stage" AS ENUM('new', 'contacted', 'quoted', 'follow_up', 'converted', 'lost');--> statement-breakpoint
CREATE TYPE "public"."ticket_category" AS ENUM('order', 'billing', 'catering', 'general', 'food_meal', 'delivery', 'plan_subscription', 'packaging', 'account_website', 'feedback');--> statement-breakpoint
CREATE TYPE "public"."ticket_message_author" AS ENUM('customer', 'staff', 'system');--> statement-breakpoint
CREATE TYPE "public"."ticket_priority" AS ENUM('low', 'normal', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."ticket_status" AS ENUM('open', 'in_progress', 'waiting_on_customer', 'resolved', 'closed');--> statement-breakpoint
CREATE TYPE "public"."section_kind" AS ENUM('tickets', 'inquiries', 'customers', 'payments');--> statement-breakpoint
CREATE TYPE "public"."day_of_week" AS ENUM('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun');--> statement-breakpoint
CREATE TYPE "public"."menu_week_status" AS ENUM('draft', 'ready', 'released');--> statement-breakpoint
CREATE TYPE "public"."tu_unit_type" AS ENUM('weight', 'count');--> statement-breakpoint
CREATE TYPE "public"."meal_rule_action" AS ENUM('max_qualifying', 'forbid', 'cannot_coexist');--> statement-breakpoint
CREATE TYPE "public"."meal_rule_condition" AS ENUM('exclusive_to_plan');--> statement-breakpoint
CREATE TYPE "public"."meal_rule_field" AS ENUM('dish_plan', 'category', 'dish', 'dish_name');--> statement-breakpoint
CREATE TYPE "public"."meal_rule_match_mode" AS ENUM('all', 'any');--> statement-breakpoint
CREATE TYPE "public"."meal_rule_operator" AS ENUM('is', 'is_not', 'is_one_of', 'is_not_one_of', 'contains', 'not_contains', 'equals', 'starts_with', 'ends_with');--> statement-breakpoint
CREATE TYPE "public"."audit_operation" AS ENUM('create', 'update', 'delete', 'read', 'login', 'logout', 'login_failed');--> statement-breakpoint
CREATE TYPE "public"."app_event" AS ENUM('order_created', 'order_activated', 'order_completed', 'order_cancelled', 'order_paused', 'payment_received', 'refund_issued', 'menu_released', 'wallet_credited', 'wallet_redeemed', 'inquiry_created', 'inquiry_follow_up', 'inquiry_converted', 'ticket_created', 'ticket_reply', 'ticket_resolved', 'signup', 'manual_adjustment', 'email_verification_link', 'email_otp_password_reset', 'email_otp_verification', 'account_deletion_confirm', 'password_changed', 'new_login_alert', 'review_nudge', 'staff_invitation', 'customer_invitation');--> statement-breakpoint
CREATE TYPE "public"."campaign_status" AS ENUM('draft', 'scheduled', 'sending', 'sent', 'completed', 'paused', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."consent_source" AS ENUM('purchase', 'express_optin', 'event_signup', 'import_other');--> statement-breakpoint
CREATE TYPE "public"."message_kind" AS ENUM('transactional', 'marketing');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('email', 'in_app', 'sms', 'whatsapp');--> statement-breakpoint
CREATE TYPE "public"."notification_outbox_status" AS ENUM('pending', 'processing', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."suppression_scope" AS ENUM('all', 'marketing');--> statement-breakpoint
CREATE TYPE "public"."file_resource_type" AS ENUM('static', 'secured');--> statement-breakpoint
CREATE TYPE "public"."file_system_node_type" AS ENUM('file', 'directory');--> statement-breakpoint
CREATE TYPE "public"."invitation_status" AS ENUM('pending', 'accepted', 'rejected', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."discount_kind" AS ENUM('delivery', 'duration', 'meal_size', 'waiver_delivery', 'waiver_base', 'waiver_strategy', 'waiver_tax');--> statement-breakpoint
CREATE TYPE "public"."delivery_charge_type" AS ENUM('none', 'fixed', 'percent');--> statement-breakpoint
CREATE TABLE "review_nudges" (
	"email" text PRIMARY KEY NOT NULL,
	"sent_at" timestamp with time zone,
	"done_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
	"impersonated_by" text,
	"active_organization_id" text,
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
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"phone_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"phone" text,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"platform_role" text,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"pin_hash" text,
	"pin_attempts" integer DEFAULT 0 NOT NULL,
	"password_set" boolean DEFAULT true NOT NULL,
	"username" text,
	"display_username" text,
	"is_anonymous" boolean DEFAULT false NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"address_line" text,
	"address_unit" text,
	"city" text,
	"postal_code" text,
	"province" text,
	"delivery_strategy_id" bigint,
	"address_tag_id" bigint,
	"dietary_notes" text,
	"allergens" text,
	"delivery_notes" text,
	"notify_email" boolean DEFAULT true NOT NULL,
	"notify_sms" boolean DEFAULT false NOT NULL,
	"locale" "locale" DEFAULT 'en' NOT NULL,
	"banned" boolean DEFAULT false,
	"ban_reason" text,
	"ban_expires" timestamp,
	"bauth_created_at" timestamp DEFAULT now() NOT NULL,
	"bauth_updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "users_username_unique" UNIQUE("username")
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
	CONSTRAINT "user_feature_flags_user_flag_unique" UNIQUE("user_id","flag_id")
);
--> statement-breakpoint
CREATE TABLE "addon_categories" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"organization_id" text,
	CONSTRAINT "addon_categories_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "addon_categories_key_unique" UNIQUE("key")
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
	"category" text NOT NULL,
	"price_per_week" numeric(10, 2) NOT NULL,
	"max_qty" integer DEFAULT 5 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"organization_id" text,
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
	"weekdays" text[],
	"active" boolean DEFAULT true NOT NULL,
	"organization_id" text,
	CONSTRAINT "delivery_frequencies_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "delivery_frequencies_key_unique" UNIQUE("key")
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
	"image" jsonb,
	"category" text,
	"plan_id" bigint NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"organization_id" text,
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
	"max_pauses" integer,
	"max_pause_days_total" integer,
	"max_pause_stretch_days" integer,
	"active" boolean DEFAULT true NOT NULL,
	"organization_id" text,
	CONSTRAINT "duration_packages_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "duration_packages_weeks_unique" UNIQUE("weeks")
);
--> statement-breakpoint
CREATE TABLE "meal_size_items" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"meal_size_id" bigint NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"plan_id" bigint NOT NULL,
	"label" text,
	"tu_amount" numeric(6, 2) DEFAULT '1' NOT NULL,
	"max_tu_amount" numeric(6, 2),
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "meal_size_items_public_id_unique" UNIQUE("public_id")
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
	"description" text,
	"plan_id" bigint NOT NULL,
	"tier" "meal_tier" NOT NULL,
	"components" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"kcal_min" integer NOT NULL,
	"kcal_max" integer NOT NULL,
	"protein_g" integer,
	"carbs_g" integer,
	"fat_g" integer,
	"base_price" numeric(10, 2) NOT NULL,
	"trial" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"organization_id" text,
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
	"allowed_start_days" text[] DEFAULT '{"mon","tue","wed","thu","fri"}' NOT NULL,
	"tag_label" text,
	"tag_color" text,
	"active" boolean DEFAULT true NOT NULL,
	"organization_id" text,
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
	"organization_id" text,
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
	"delivery_id" bigint,
	"organization_id" text,
	CONSTRAINT "order_activities_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "order_addons" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"order_id" bigint NOT NULL,
	"addon_key" text NOT NULL,
	"addon_name" text NOT NULL,
	"price_per_week" numeric(10, 2) NOT NULL,
	"qty" integer DEFAULT 1 NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"organization_id" text,
	CONSTRAINT "order_addons_public_id_unique" UNIQUE("public_id")
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
	"category_counts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"eating_days" text[],
	"include_saturday" boolean DEFAULT false NOT NULL,
	"include_sunday" boolean DEFAULT false NOT NULL,
	"duration_weeks" integer NOT NULL,
	"start_date" date NOT NULL,
	"tiffin_count" integer NOT NULL,
	"pooled_tiffin_count" integer DEFAULT 0 NOT NULL,
	"per_tiffin_price" numeric(10, 2) NOT NULL,
	"pricing_snapshot" jsonb NOT NULL,
	"total" numeric(10, 2) NOT NULL,
	"status" "order_status" DEFAULT 'pending' NOT NULL,
	"deployment_id" text NOT NULL,
	"zone_id" bigint,
	"address_id" bigint,
	"full_name" text NOT NULL,
	"address_line" text NOT NULL,
	"address_unit" text,
	"delivery_instructions" text,
	"delivery_charge" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"delivery_strategy_id" bigint,
	"delivery_strategy_ids" bigint[] DEFAULT '{}'::bigint[] NOT NULL,
	"delivery_tag_id" bigint,
	"address_tag_id" bigint,
	"city" text NOT NULL,
	"postal_code" text NOT NULL,
	"latitude" double precision,
	"longitude" double precision,
	"organization_id" text,
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
	"reference" text,
	"proof" jsonb,
	"claimed_at" bigint,
	"note" text,
	"organization_id" text,
	CONSTRAINT "payments_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "deliveries" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"order_id" bigint NOT NULL,
	"delivery_date" date NOT NULL,
	"status" "delivery_status" DEFAULT 'scheduled' NOT NULL,
	"cutoff_at" bigint NOT NULL,
	"tiffin_units" integer DEFAULT 1 NOT NULL,
	"covers_dates" text[],
	"merged_into_delivery_id" bigint,
	"makeup_for_delivery_id" bigint,
	"pooled_at" bigint,
	"address_id" bigint,
	"full_name" text,
	"address_line" text,
	"address_unit" text,
	"city" text,
	"postal_code" text,
	"delivery_instructions" text,
	"delivery_strategy_id" bigint,
	"delivery_strategy_ids" bigint[] DEFAULT '{}'::bigint[] NOT NULL,
	"delivery_tag_id" bigint,
	"address_tag_id" bigint,
	"zone_id" bigint,
	"route_driver_serial" text,
	"route_driver_name" text,
	"route_stop_number" integer,
	"route_synced_at" bigint,
	"optimo_completion_status" text,
	"optimo_completed_at" bigint,
	"optimo_completion_note" text,
	"organization_id" text,
	CONSTRAINT "deliveries_public_id_unique" UNIQUE("public_id")
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
	"organization_id" text,
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
	"allowed_payment_methods" text[] DEFAULT '{}' NOT NULL,
	"starts_at" bigint,
	"expires_at" bigint,
	"owner_user_id" bigint,
	"ist_date" text,
	"active" boolean DEFAULT true NOT NULL,
	"config" jsonb,
	"organization_id" text,
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
	"organization_id" text,
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
	"frequency_key_interest" text,
	"eating_days_interest" text[],
	"postal_code" text,
	"zone_id" bigint,
	"preferred_start" date,
	"quoted_price" numeric(10, 2),
	"lost_reason" "inquiry_lost_reason",
	"notes" text,
	"organization_id" text,
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
	"organization_id" text,
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
	"attachments" jsonb,
	"organization_id" text,
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
	"subcategory" text,
	"status" "ticket_status" DEFAULT 'open' NOT NULL,
	"priority" "ticket_priority" DEFAULT 'normal' NOT NULL,
	"current_owner" bigint,
	"order_id" bigint,
	"closed_at" bigint,
	"organization_id" text,
	CONSTRAINT "tickets_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "section_seen" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"user_id" bigint NOT NULL,
	"section" "section_kind" NOT NULL,
	"seen_at" bigint NOT NULL,
	CONSTRAINT "section_seen_public_id_unique" UNIQUE("public_id")
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
	"organization_id" text,
	CONSTRAINT "inquiry_user_config_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "inquiry_user_config_user_source_unique" UNIQUE("user_id","source_id")
);
--> statement-breakpoint
CREATE TABLE "category_plans" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"category_id" bigint NOT NULL,
	"plan_id" bigint NOT NULL,
	"organization_id" text,
	CONSTRAINT "category_plans_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "category_swap_pairs" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"from_category_id" bigint NOT NULL,
	"to_category_id" bigint NOT NULL,
	"plan_id" bigint,
	"organization_id" text,
	"exchange_overrides" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "category_swap_pairs_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "dish_categories" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"selectable" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"tu_unit_type" "tu_unit_type" DEFAULT 'weight' NOT NULL,
	"tu_unit_size" numeric(6, 2) DEFAULT '8' NOT NULL,
	"tu_unit_label" text DEFAULT 'oz' NOT NULL,
	"max_picks_per_tiffin" integer,
	"organization_id" text,
	CONSTRAINT "dish_categories_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "dish_category_addon_categories" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"dish_category_id" bigint NOT NULL,
	"addon_category_id" bigint NOT NULL,
	"organization_id" text,
	CONSTRAINT "dish_category_addon_categories_public_id_unique" UNIQUE("public_id")
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
	"category_id" bigint NOT NULL,
	"person_index" integer NOT NULL,
	"pick_index" integer DEFAULT 1 NOT NULL,
	"dish_id" bigint NOT NULL,
	"organization_id" text,
	CONSTRAINT "meal_selections_public_id_unique" UNIQUE("public_id")
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
	"category_id" bigint NOT NULL,
	"dish_id" bigint NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"organization_id" text,
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
	"week_start" date NOT NULL,
	"status" "menu_week_status" DEFAULT 'draft' NOT NULL,
	"order_cutoff" bigint NOT NULL,
	"released_at" bigint,
	"organization_id" text,
	CONSTRAINT "menu_weeks_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "delivery_category_swaps" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"delivery_id" bigint NOT NULL,
	"from_category" text NOT NULL,
	"to_category" text NOT NULL,
	"qty_from" integer NOT NULL,
	"qty_to" integer NOT NULL,
	"from_row" integer,
	"for_date" date,
	"receive_tu" numeric(6, 2),
	"organization_id" text,
	CONSTRAINT "delivery_category_swaps_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "meal_rule_conditions" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"rule_id" bigint NOT NULL,
	"field" "meal_rule_field" NOT NULL,
	"operator" "meal_rule_operator" NOT NULL,
	"value_ids" bigint[],
	"value_keys" text[],
	"value_text" text,
	"organization_id" text,
	CONSTRAINT "meal_rule_conditions_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "meal_rules" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"name" text,
	"description" text,
	"scope_plan_id" bigint,
	"scope_meal_size_id" bigint,
	"match_mode" "meal_rule_match_mode" DEFAULT 'all' NOT NULL,
	"action" "meal_rule_action" DEFAULT 'max_qualifying' NOT NULL,
	"action_value" integer,
	"priority" integer DEFAULT 0 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"plan_id" bigint,
	"category_key" text,
	"condition" "meal_rule_condition",
	"max_count" integer,
	"organization_id" text,
	CONSTRAINT "meal_rules_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "delivery_extra_tiffins" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"delivery_id" bigint NOT NULL,
	"eat_date" date NOT NULL,
	"organization_id" text,
	CONSTRAINT "delivery_extra_tiffins_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "delivery_moves" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"order_id" bigint NOT NULL,
	"from_delivery_id" bigint,
	"to_delivery_id" bigint NOT NULL,
	"from_eat_date" date,
	"to_eat_date" date NOT NULL,
	"organization_id" text,
	CONSTRAINT "delivery_moves_public_id_unique" UNIQUE("public_id")
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
	"default_max_pauses" integer,
	"default_max_pause_days_total" integer,
	"default_max_pause_stretch_days" integer,
	"min_tiffins_per_week" integer DEFAULT 3 NOT NULL,
	"max_tiffins_per_week" integer DEFAULT 7 NOT NULL,
	"max_discount_pct" integer DEFAULT 25 NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"default_country" text,
	"lead_assignment" jsonb,
	"meal_types" jsonb,
	"discount_policy" jsonb,
	"payment_config" jsonb,
	"integrations_config" jsonb,
	"max_wallet_balance" integer,
	"max_coin_pct_of_subtotal" integer,
	"max_coin_redeem_pct_of_balance" integer,
	"province_taxes" jsonb,
	"profitability_assumptions" jsonb,
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
CREATE TABLE "meal_payout" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"meal_size_id" bigint,
	"duration_package_id" bigint,
	"coins" integer DEFAULT 0 NOT NULL,
	"organization_id" text,
	CONSTRAINT "meal_payout_public_id_unique" UNIQUE("public_id")
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
	"reserved_until" bigint,
	CONSTRAINT "wallet_ledger_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "campaign" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"name" text NOT NULL,
	"channels" "notification_channel"[] NOT NULL,
	"audience" jsonb NOT NULL,
	"status" "campaign_status" DEFAULT 'draft' NOT NULL,
	"scheduled_at" bigint,
	"sent_at" bigint,
	"counts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "campaign_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "campaign_content" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"campaign_id" bigint NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"locale" "locale" NOT NULL,
	"subject" text NOT NULL,
	"body" text,
	"html" text,
	"text" text,
	"provider_template_id" text,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "campaign_content_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "contact_list" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"name" text NOT NULL,
	"consent_source" "consent_source" NOT NULL,
	"consent_at" bigint NOT NULL,
	"consent_note" text,
	"member_count" integer DEFAULT 0 NOT NULL,
	"segment_def" jsonb,
	CONSTRAINT "contact_list_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "contact_list_member" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"list_id" bigint NOT NULL,
	"email" text,
	"phone" text,
	"name" text,
	"vars" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"unsubscribed_at" bigint,
	CONSTRAINT "contact_list_member_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "message_suppression" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"address" text NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"scope" "suppression_scope" DEFAULT 'all' NOT NULL,
	"reason" text NOT NULL,
	"campaign_id" bigint,
	CONSTRAINT "message_suppression_public_id_unique" UNIQUE("public_id")
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
	"recipient_id" bigint,
	"recipient_email" text,
	"recipient_phone" text,
	"channel" "notification_channel" NOT NULL,
	"kind" "message_kind" DEFAULT 'transactional' NOT NULL,
	"event" "app_event",
	"campaign_id" bigint,
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
	"kind" "message_kind" DEFAULT 'transactional' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"consent_source" text,
	"consent_at" bigint,
	CONSTRAINT "notification_prefs_public_id_unique" UNIQUE("public_id")
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
	"provider_template_id" text,
	"enabled" boolean DEFAULT true NOT NULL,
	CONSTRAINT "notification_template_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"user_id" bigint NOT NULL,
	"event" "app_event",
	"title" text NOT NULL,
	"body" text NOT NULL,
	"href" text,
	"read_at" bigint,
	CONSTRAINT "notifications_public_id_unique" UNIQUE("public_id")
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
CREATE TABLE "subscription_pauses" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"order_id" bigint NOT NULL,
	"from_date" date NOT NULL,
	"until_date" date NOT NULL,
	"is_indefinite" boolean DEFAULT false NOT NULL,
	"resumed_at" timestamp with time zone,
	"resumed_by" bigint,
	"organization_id" text,
	CONSTRAINT "subscription_pauses_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" text PRIMARY KEY DEFAULT (next_id())::text NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text,
	"status" "invitation_status" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"inviter_id" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" text PRIMARY KEY DEFAULT (next_id())::text NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" bigint NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" text PRIMARY KEY DEFAULT (next_id())::text NOT NULL,
	"name" text NOT NULL,
	"slug" text,
	"logo" text,
	"metadata" text,
	"client_code" text NOT NULL,
	"parent_organization_id" text,
	"region" text,
	"city" text,
	"address" text,
	"latitude" double precision,
	"longitude" double precision,
	"timezone" text,
	"cutoff_hour" integer,
	"default_max_pauses" integer,
	"default_max_pause_days_total" integer,
	"default_max_pause_stretch_days" integer,
	"currency" text,
	"default_country" text,
	"lead_assignment" jsonb,
	"meal_types" jsonb,
	"discount_policy" jsonb,
	"payment_config" jsonb,
	"integrations_config" jsonb,
	"max_wallet_balance" integer,
	"is_default_location" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "organization_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "public_faqs" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"organization_id" text,
	CONSTRAINT "public_faqs_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "discounts" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"kind" "discount_kind" NOT NULL,
	"target_id" bigint,
	"percent" numeric(5, 2) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"starts_at" bigint,
	"ends_at" bigint,
	"min_weeks" integer,
	"amount" numeric(10, 2),
	"organization_id" text,
	CONSTRAINT "discounts_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "discounts_key_unique" UNIQUE("key"),
	CONSTRAINT "discounts_percent_range" CHECK ("discounts"."percent" >= 0 AND "discounts"."percent" <= 100)
);
--> statement-breakpoint
CREATE TABLE "address_tags" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"name" text NOT NULL,
	"description" text,
	"charge_type" "delivery_charge_type" DEFAULT 'none' NOT NULL,
	"charge_value" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"organization_id" text,
	CONSTRAINT "address_tags_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "delivery_charge_configs" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"base_charge" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"store_lat" numeric(9, 6),
	"store_lng" numeric(9, 6),
	"organization_id" text,
	CONSTRAINT "delivery_charge_configs_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "delivery_strategies" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"name" text NOT NULL,
	"description" text,
	"charge_type" "delivery_charge_type" DEFAULT 'none' NOT NULL,
	"charge_value" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"organization_id" text,
	"group_id" bigint,
	"connection_id" bigint,
	"charge_basis" text DEFAULT 'once' NOT NULL,
	CONSTRAINT "delivery_strategies_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "delivery_strategy_connections" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"name" text NOT NULL,
	"group_id" bigint NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"organization_id" text,
	CONSTRAINT "delivery_strategy_connections_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "delivery_strategy_groups" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"name" text NOT NULL,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"organization_id" text,
	CONSTRAINT "delivery_strategy_groups_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "delivery_types" (
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
	"requires_address" boolean DEFAULT true NOT NULL,
	"requires_schedule" boolean DEFAULT false NOT NULL,
	"min_subtotal" numeric(10, 2) DEFAULT '0' NOT NULL,
	"discount_pct" numeric(5, 2) DEFAULT '0' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"organization_id" text,
	CONSTRAINT "delivery_types_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "delivery_types_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "delivery_zone_types" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"zone_id" bigint NOT NULL,
	"type_id" bigint NOT NULL,
	CONSTRAINT "delivery_zone_types_public_id_unique" UNIQUE("public_id")
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
	"radius_km" numeric(6, 2),
	"postal_prefixes" text[] DEFAULT '{}'::text[] NOT NULL,
	"slot_window" text,
	"active" boolean DEFAULT true NOT NULL,
	"organization_id" text,
	CONSTRAINT "delivery_zones_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "delivery_zones_shape_check" CHECK (("delivery_zones"."radius_km" IS NULL) <> (cardinality("delivery_zones"."postal_prefixes") = 0))
);
--> statement-breakpoint
CREATE TABLE "customer_addresses" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"user_id" bigint NOT NULL,
	"label" text NOT NULL,
	"full_name" text,
	"address_line" text NOT NULL,
	"address_unit" text,
	"city" text NOT NULL,
	"province" text,
	"postal_code" text NOT NULL,
	"delivery_instructions" text,
	"lat" numeric(9, 6),
	"lng" numeric(9, 6),
	"is_default" boolean DEFAULT false NOT NULL,
	"archived_at" bigint,
	"organization_id" text,
	"address_tag_id" bigint,
	"delivery_strategy_id" bigint,
	"delivery_strategy_ids" bigint[] DEFAULT '{}'::bigint[] NOT NULL,
	"delivery_tag_id" bigint,
	CONSTRAINT "customer_addresses_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_delivery_strategy_id_delivery_strategies_id_fk" FOREIGN KEY ("delivery_strategy_id") REFERENCES "public"."delivery_strategies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_address_tag_id_address_tags_id_fk" FOREIGN KEY ("address_tag_id") REFERENCES "public"."address_tags"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_feature_flags" ADD CONSTRAINT "user_feature_flags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_feature_flags" ADD CONSTRAINT "user_feature_flags_flag_id_feature_flags_id_fk" FOREIGN KEY ("flag_id") REFERENCES "public"."feature_flags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "addon_categories" ADD CONSTRAINT "addon_categories_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "addons" ADD CONSTRAINT "addons_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_frequencies" ADD CONSTRAINT "delivery_frequencies_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dishes" ADD CONSTRAINT "dishes_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dishes" ADD CONSTRAINT "dishes_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duration_packages" ADD CONSTRAINT "duration_packages_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_size_items" ADD CONSTRAINT "meal_size_items_meal_size_id_meal_sizes_id_fk" FOREIGN KEY ("meal_size_id") REFERENCES "public"."meal_sizes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_size_items" ADD CONSTRAINT "meal_size_items_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_sizes" ADD CONSTRAINT "meal_sizes_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_sizes" ADD CONSTRAINT "meal_sizes_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_tiers" ADD CONSTRAINT "pricing_tiers_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_activities" ADD CONSTRAINT "order_activities_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_activities" ADD CONSTRAINT "order_activities_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_addons" ADD CONSTRAINT "order_addons_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_addons" ADD CONSTRAINT "order_addons_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_current_owner_users_id_fk" FOREIGN KEY ("current_owner") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_meal_size_id_meal_sizes_id_fk" FOREIGN KEY ("meal_size_id") REFERENCES "public"."meal_sizes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_frequency_id_delivery_frequencies_id_fk" FOREIGN KEY ("frequency_id") REFERENCES "public"."delivery_frequencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_zone_id_delivery_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."delivery_zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_address_id_customer_addresses_id_fk" FOREIGN KEY ("address_id") REFERENCES "public"."customer_addresses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_delivery_strategy_id_delivery_strategies_id_fk" FOREIGN KEY ("delivery_strategy_id") REFERENCES "public"."delivery_strategies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_delivery_tag_id_delivery_strategy_groups_id_fk" FOREIGN KEY ("delivery_tag_id") REFERENCES "public"."delivery_strategy_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_address_tag_id_address_tags_id_fk" FOREIGN KEY ("address_tag_id") REFERENCES "public"."address_tags"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_merged_into_delivery_id_deliveries_id_fk" FOREIGN KEY ("merged_into_delivery_id") REFERENCES "public"."deliveries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_makeup_for_delivery_id_deliveries_id_fk" FOREIGN KEY ("makeup_for_delivery_id") REFERENCES "public"."deliveries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_address_id_customer_addresses_id_fk" FOREIGN KEY ("address_id") REFERENCES "public"."customer_addresses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_delivery_strategy_id_delivery_strategies_id_fk" FOREIGN KEY ("delivery_strategy_id") REFERENCES "public"."delivery_strategies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_delivery_tag_id_delivery_strategy_groups_id_fk" FOREIGN KEY ("delivery_tag_id") REFERENCES "public"."delivery_strategy_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_address_tag_id_address_tags_id_fk" FOREIGN KEY ("address_tag_id") REFERENCES "public"."address_tags"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_zone_id_delivery_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."delivery_zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_coupon_id_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_redeemed_by_users_id_fk" FOREIGN KEY ("redeemed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_source_id_lead_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."lead_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_sub_source_id_lead_subsources_id_fk" FOREIGN KEY ("sub_source_id") REFERENCES "public"."lead_subsources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_current_owner_users_id_fk" FOREIGN KEY ("current_owner") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_converted_order_id_orders_id_fk" FOREIGN KEY ("converted_order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_zone_id_delivery_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."delivery_zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiry_activities" ADD CONSTRAINT "inquiry_activities_inquiry_id_inquiries_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."inquiries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiry_activities" ADD CONSTRAINT "inquiry_activities_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_raised_by_users_id_fk" FOREIGN KEY ("raised_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_current_owner_users_id_fk" FOREIGN KEY ("current_owner") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section_seen" ADD CONSTRAINT "section_seen_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_subsources" ADD CONSTRAINT "lead_subsources_source_id_lead_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."lead_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiry_user_config" ADD CONSTRAINT "inquiry_user_config_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiry_user_config" ADD CONSTRAINT "inquiry_user_config_source_id_lead_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."lead_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiry_user_config" ADD CONSTRAINT "inquiry_user_config_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_plans" ADD CONSTRAINT "category_plans_category_id_dish_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."dish_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_plans" ADD CONSTRAINT "category_plans_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_plans" ADD CONSTRAINT "category_plans_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_swap_pairs" ADD CONSTRAINT "category_swap_pairs_from_category_id_dish_categories_id_fk" FOREIGN KEY ("from_category_id") REFERENCES "public"."dish_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_swap_pairs" ADD CONSTRAINT "category_swap_pairs_to_category_id_dish_categories_id_fk" FOREIGN KEY ("to_category_id") REFERENCES "public"."dish_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_swap_pairs" ADD CONSTRAINT "category_swap_pairs_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_swap_pairs" ADD CONSTRAINT "category_swap_pairs_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dish_categories" ADD CONSTRAINT "dish_categories_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dish_category_addon_categories" ADD CONSTRAINT "dish_category_addon_categories_dish_category_id_dish_categories_id_fk" FOREIGN KEY ("dish_category_id") REFERENCES "public"."dish_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dish_category_addon_categories" ADD CONSTRAINT "dish_category_addon_categories_addon_category_id_addon_categories_id_fk" FOREIGN KEY ("addon_category_id") REFERENCES "public"."addon_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dish_category_addon_categories" ADD CONSTRAINT "dish_category_addon_categories_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_selections" ADD CONSTRAINT "meal_selections_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_selections" ADD CONSTRAINT "meal_selections_menu_week_id_menu_weeks_id_fk" FOREIGN KEY ("menu_week_id") REFERENCES "public"."menu_weeks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_selections" ADD CONSTRAINT "meal_selections_category_id_dish_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."dish_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_selections" ADD CONSTRAINT "meal_selections_dish_id_dishes_id_fk" FOREIGN KEY ("dish_id") REFERENCES "public"."dishes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_selections" ADD CONSTRAINT "meal_selections_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_menu_week_id_menu_weeks_id_fk" FOREIGN KEY ("menu_week_id") REFERENCES "public"."menu_weeks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_category_id_dish_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."dish_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_dish_id_dishes_id_fk" FOREIGN KEY ("dish_id") REFERENCES "public"."dishes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_weeks" ADD CONSTRAINT "menu_weeks_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_category_swaps" ADD CONSTRAINT "delivery_category_swaps_delivery_id_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."deliveries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_category_swaps" ADD CONSTRAINT "delivery_category_swaps_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_rule_conditions" ADD CONSTRAINT "meal_rule_conditions_rule_id_meal_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."meal_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_rule_conditions" ADD CONSTRAINT "meal_rule_conditions_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_rules" ADD CONSTRAINT "meal_rules_scope_plan_id_plans_id_fk" FOREIGN KEY ("scope_plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_rules" ADD CONSTRAINT "meal_rules_scope_meal_size_id_meal_sizes_id_fk" FOREIGN KEY ("scope_meal_size_id") REFERENCES "public"."meal_sizes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_rules" ADD CONSTRAINT "meal_rules_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_rules" ADD CONSTRAINT "meal_rules_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_extra_tiffins" ADD CONSTRAINT "delivery_extra_tiffins_delivery_id_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."deliveries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_extra_tiffins" ADD CONSTRAINT "delivery_extra_tiffins_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_moves" ADD CONSTRAINT "delivery_moves_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_moves" ADD CONSTRAINT "delivery_moves_from_delivery_id_deliveries_id_fk" FOREIGN KEY ("from_delivery_id") REFERENCES "public"."deliveries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_moves" ADD CONSTRAINT "delivery_moves_to_delivery_id_deliveries_id_fk" FOREIGN KEY ("to_delivery_id") REFERENCES "public"."deliveries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_moves" ADD CONSTRAINT "delivery_moves_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_payout" ADD CONSTRAINT "meal_payout_meal_size_id_meal_sizes_id_fk" FOREIGN KEY ("meal_size_id") REFERENCES "public"."meal_sizes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_payout" ADD CONSTRAINT "meal_payout_duration_package_id_duration_packages_id_fk" FOREIGN KEY ("duration_package_id") REFERENCES "public"."duration_packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_payout" ADD CONSTRAINT "meal_payout_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_ledger" ADD CONSTRAINT "wallet_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_ledger" ADD CONSTRAINT "wallet_ledger_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_content" ADD CONSTRAINT "campaign_content_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_list_member" ADD CONSTRAINT "contact_list_member_list_id_contact_list_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."contact_list"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_prefs" ADD CONSTRAINT "notification_prefs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files_file_system" ADD CONSTRAINT "files_file_system_parent_id_files_file_system_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."files_file_system"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_pauses" ADD CONSTRAINT "subscription_pauses_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_pauses" ADD CONSTRAINT "subscription_pauses_resumed_by_users_id_fk" FOREIGN KEY ("resumed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_pauses" ADD CONSTRAINT "subscription_pauses_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviter_id_users_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_parent_organization_id_organization_id_fk" FOREIGN KEY ("parent_organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_faqs" ADD CONSTRAINT "public_faqs_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "address_tags" ADD CONSTRAINT "address_tags_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_charge_configs" ADD CONSTRAINT "delivery_charge_configs_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_strategies" ADD CONSTRAINT "delivery_strategies_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_strategies" ADD CONSTRAINT "delivery_strategies_group_id_delivery_strategy_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."delivery_strategy_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_strategies" ADD CONSTRAINT "delivery_strategies_connection_id_delivery_strategy_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."delivery_strategy_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_strategy_connections" ADD CONSTRAINT "delivery_strategy_connections_group_id_delivery_strategy_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."delivery_strategy_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_strategy_connections" ADD CONSTRAINT "delivery_strategy_connections_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_strategy_groups" ADD CONSTRAINT "delivery_strategy_groups_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_types" ADD CONSTRAINT "delivery_types_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_zone_types" ADD CONSTRAINT "delivery_zone_types_zone_id_delivery_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."delivery_zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_zone_types" ADD CONSTRAINT "delivery_zone_types_type_id_delivery_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."delivery_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_zones" ADD CONSTRAINT "delivery_zones_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_address_tag_id_address_tags_id_fk" FOREIGN KEY ("address_tag_id") REFERENCES "public"."address_tags"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_delivery_strategy_id_delivery_strategies_id_fk" FOREIGN KEY ("delivery_strategy_id") REFERENCES "public"."delivery_strategies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_delivery_tag_id_delivery_strategy_groups_id_fk" FOREIGN KEY ("delivery_tag_id") REFERENCES "public"."delivery_strategy_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "review_nudges_sent_idx" ON "review_nudges" USING btree ("sent_at");--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "users_phone_unique" ON "users" USING btree ("phone") WHERE "users"."phone" is not null;--> statement-breakpoint
CREATE INDEX "users_created_idx" ON "users" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "user_feature_flags_flag_idx" ON "user_feature_flags" USING btree ("flag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dishes_name_unique" ON "dishes" USING btree ("name");--> statement-breakpoint
CREATE INDEX "dishes_plan_idx" ON "dishes" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "meal_size_items_meal_size_idx" ON "meal_size_items" USING btree ("meal_size_id");--> statement-breakpoint
CREATE INDEX "meal_size_items_plan_idx" ON "meal_size_items" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "meal_sizes_plan_idx" ON "meal_sizes" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "order_activities_order_created_idx" ON "order_activities" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE INDEX "order_activities_organization_idx" ON "order_activities" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "order_activities_delivery_idx" ON "order_activities" USING btree ("delivery_id");--> statement-breakpoint
CREATE INDEX "order_addons_order_idx" ON "order_addons" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "orders_user_created_idx" ON "orders" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_current_owner_idx" ON "orders" USING btree ("current_owner");--> statement-breakpoint
CREATE INDEX "orders_organization_idx" ON "orders" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "orders_status_created_idx" ON "orders" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "orders_plan_idx" ON "orders" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "orders_zone_idx" ON "orders" USING btree ("zone_id");--> statement-breakpoint
CREATE INDEX "orders_meal_size_idx" ON "orders" USING btree ("meal_size_id");--> statement-breakpoint
CREATE INDEX "orders_frequency_idx" ON "orders" USING btree ("frequency_id");--> statement-breakpoint
CREATE INDEX "orders_delivery_strategy_idx" ON "orders" USING btree ("delivery_strategy_id");--> statement-breakpoint
CREATE INDEX "orders_address_tag_idx" ON "orders" USING btree ("address_tag_id");--> statement-breakpoint
CREATE INDEX "orders_address_idx" ON "orders" USING btree ("address_id");--> statement-breakpoint
CREATE INDEX "payments_order_idx" ON "payments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "payments_organization_idx" ON "payments" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "payments_status_idx" ON "payments" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "deliveries_order_date_unique" ON "deliveries" USING btree ("order_id","delivery_date");--> statement-breakpoint
CREATE UNIQUE INDEX "deliveries_makeup_unique" ON "deliveries" USING btree ("makeup_for_delivery_id");--> statement-breakpoint
CREATE INDEX "deliveries_date_idx" ON "deliveries" USING btree ("delivery_date");--> statement-breakpoint
CREATE INDEX "deliveries_zone_idx" ON "deliveries" USING btree ("zone_id");--> statement-breakpoint
CREATE INDEX "deliveries_address_idx" ON "deliveries" USING btree ("address_id");--> statement-breakpoint
CREATE INDEX "deliveries_delivery_strategy_idx" ON "deliveries" USING btree ("delivery_strategy_id");--> statement-breakpoint
CREATE INDEX "deliveries_address_tag_idx" ON "deliveries" USING btree ("address_tag_id");--> statement-breakpoint
CREATE INDEX "deliveries_merged_into_idx" ON "deliveries" USING btree ("merged_into_delivery_id") WHERE "deliveries"."merged_into_delivery_id" is not null;--> statement-breakpoint
CREATE INDEX "deliveries_organization_idx" ON "deliveries" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "coupon_redemptions_coupon_idx" ON "coupon_redemptions" USING btree ("coupon_id");--> statement-breakpoint
CREATE INDEX "coupon_redemptions_user_idx" ON "coupon_redemptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "coupon_redemptions_order_idx" ON "coupon_redemptions" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "coupon_redemptions_organization_idx" ON "coupon_redemptions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "coupon_redemptions_redeemed_by_idx" ON "coupon_redemptions" USING btree ("redeemed_by");--> statement-breakpoint
CREATE INDEX "coupons_kind_active_idx" ON "coupons" USING btree ("kind","active");--> statement-breakpoint
CREATE UNIQUE INDEX "coupons_rep_daily_unique" ON "coupons" USING btree ("owner_user_id","ist_date") WHERE "coupons"."kind" = 'rep_daily';--> statement-breakpoint
CREATE INDEX "ledger_entries_user_created_idx" ON "ledger_entries" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "ledger_entries_order_idx" ON "ledger_entries" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_organization_idx" ON "ledger_entries" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_payment_idx" ON "ledger_entries" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "inquiries_phone_lower_idx" ON "inquiries" USING btree (lower("phone"));--> statement-breakpoint
CREATE INDEX "inquiries_email_lower_idx" ON "inquiries" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "inquiries_owner_idx" ON "inquiries" USING btree ("current_owner");--> statement-breakpoint
CREATE UNIQUE INDEX "inquiries_open_phone_source_unique" ON "inquiries" USING btree (lower("phone"),"source_id") WHERE "inquiries"."stage" not in ('converted', 'lost');--> statement-breakpoint
CREATE INDEX "inquiries_created_idx" ON "inquiries" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "inquiries_organization_idx" ON "inquiries" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "inquiries_stage_created_idx" ON "inquiries" USING btree ("stage","created_at");--> statement-breakpoint
CREATE INDEX "inquiries_source_idx" ON "inquiries" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "inquiries_converted_order_idx" ON "inquiries" USING btree ("converted_order_id");--> statement-breakpoint
CREATE INDEX "inquiries_sub_source_idx" ON "inquiries" USING btree ("sub_source_id");--> statement-breakpoint
CREATE INDEX "inquiries_zone_idx" ON "inquiries" USING btree ("zone_id");--> statement-breakpoint
CREATE INDEX "inquiry_activities_inquiry_created_idx" ON "inquiry_activities" USING btree ("inquiry_id","created_at");--> statement-breakpoint
CREATE INDEX "inquiry_activities_organization_idx" ON "inquiry_activities" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "ticket_messages_ticket_created_idx" ON "ticket_messages" USING btree ("ticket_id","created_at");--> statement-breakpoint
CREATE INDEX "ticket_messages_organization_idx" ON "ticket_messages" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "ticket_messages_author_idx" ON "ticket_messages" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "tickets_raised_by_idx" ON "tickets" USING btree ("raised_by");--> statement-breakpoint
CREATE INDEX "tickets_owner_idx" ON "tickets" USING btree ("current_owner");--> statement-breakpoint
CREATE INDEX "tickets_status_idx" ON "tickets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tickets_created_idx" ON "tickets" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "tickets_organization_idx" ON "tickets" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "tickets_order_idx" ON "tickets" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "section_seen_user_section_idx" ON "section_seen" USING btree ("user_id","section");--> statement-breakpoint
CREATE INDEX "lead_subsources_source_idx" ON "lead_subsources" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "inquiry_user_config_source_idx" ON "inquiry_user_config" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "inquiry_user_config_organization_idx" ON "inquiry_user_config" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "category_plans_category_plan_unique" ON "category_plans" USING btree ("category_id","plan_id");--> statement-breakpoint
CREATE INDEX "category_plans_plan_idx" ON "category_plans" USING btree ("plan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "category_swap_pairs_pair_unique" ON "category_swap_pairs" USING btree ("from_category_id","to_category_id","plan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "category_swap_pairs_pair_null_plan_unique" ON "category_swap_pairs" USING btree ("from_category_id","to_category_id") WHERE "category_swap_pairs"."plan_id" IS NULL;--> statement-breakpoint
CREATE INDEX "category_swap_pairs_to_category_idx" ON "category_swap_pairs" USING btree ("to_category_id");--> statement-breakpoint
CREATE INDEX "category_swap_pairs_plan_idx" ON "category_swap_pairs" USING btree ("plan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dish_categories_key_unique" ON "dish_categories" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "dish_category_addon_categories_unique" ON "dish_category_addon_categories" USING btree ("dish_category_id","addon_category_id");--> statement-breakpoint
CREATE INDEX "dish_category_addon_categories_addon_category_idx" ON "dish_category_addon_categories" USING btree ("addon_category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "meal_selections_unique" ON "meal_selections" USING btree ("order_id","menu_week_id","day_of_week","category_id","person_index","pick_index");--> statement-breakpoint
CREATE INDEX "meal_selections_menu_week_idx" ON "meal_selections" USING btree ("menu_week_id");--> statement-breakpoint
CREATE INDEX "meal_selections_category_idx" ON "meal_selections" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "meal_selections_dish_idx" ON "meal_selections" USING btree ("dish_id");--> statement-breakpoint
CREATE UNIQUE INDEX "menu_items_unique" ON "menu_items" USING btree ("menu_week_id","day_of_week","category_id","dish_id");--> statement-breakpoint
CREATE INDEX "menu_items_dish_idx" ON "menu_items" USING btree ("dish_id");--> statement-breakpoint
CREATE UNIQUE INDEX "menu_weeks_week_unique" ON "menu_weeks" USING btree ("week_start");--> statement-breakpoint
CREATE INDEX "delivery_category_swaps_delivery_idx" ON "delivery_category_swaps" USING btree ("delivery_id");--> statement-breakpoint
CREATE INDEX "delivery_category_swaps_organization_idx" ON "delivery_category_swaps" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "meal_rule_conditions_rule_idx" ON "meal_rule_conditions" USING btree ("rule_id");--> statement-breakpoint
CREATE INDEX "meal_rules_scope_plan_idx" ON "meal_rules" USING btree ("scope_plan_id");--> statement-breakpoint
CREATE INDEX "meal_rules_scope_meal_size_idx" ON "meal_rules" USING btree ("scope_meal_size_id");--> statement-breakpoint
CREATE INDEX "meal_rules_plan_idx" ON "meal_rules" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "delivery_extra_tiffins_delivery_idx" ON "delivery_extra_tiffins" USING btree ("delivery_id");--> statement-breakpoint
CREATE INDEX "delivery_extra_tiffins_organization_idx" ON "delivery_extra_tiffins" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "delivery_moves_order_idx" ON "delivery_moves" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "delivery_moves_from_idx" ON "delivery_moves" USING btree ("from_delivery_id");--> statement-breakpoint
CREATE INDEX "delivery_moves_to_idx" ON "delivery_moves" USING btree ("to_delivery_id");--> statement-breakpoint
CREATE INDEX "delivery_moves_organization_idx" ON "delivery_moves" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "coin_rate_currency_created_idx" ON "coin_rate" USING btree ("currency","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "meal_payout_combo_unique" ON "meal_payout" USING btree ("meal_size_id","duration_package_id");--> statement-breakpoint
CREATE INDEX "meal_payout_duration_package_idx" ON "meal_payout" USING btree ("duration_package_id");--> statement-breakpoint
CREATE INDEX "wallet_user_created_idx" ON "wallet_ledger" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "wallet_reserved_until_idx" ON "wallet_ledger" USING btree ("reserved_until");--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_earn_idempotent_idx" ON "wallet_ledger" USING btree ("source_type","source_id","event_type");--> statement-breakpoint
CREATE INDEX "campaign_status_scheduled_idx" ON "campaign" USING btree ("status","scheduled_at");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_content_key_idx" ON "campaign_content" USING btree ("campaign_id","channel","locale");--> statement-breakpoint
CREATE UNIQUE INDEX "contact_list_member_email_idx" ON "contact_list_member" USING btree ("list_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "contact_list_member_phone_idx" ON "contact_list_member" USING btree ("list_id","phone");--> statement-breakpoint
CREATE UNIQUE INDEX "message_suppression_address_channel_scope_idx" ON "message_suppression" USING btree ("address","channel","scope");--> statement-breakpoint
CREATE INDEX "notification_outbox_due_idx" ON "notification_outbox" USING btree ("kind","status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "notification_outbox_campaign_idx" ON "notification_outbox" USING btree ("campaign_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_outbox_dedupe_idx" ON "notification_outbox" USING btree ("dedupe_key");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_prefs_user_channel_kind_idx" ON "notification_prefs" USING btree ("user_id","channel","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_template_key_idx" ON "notification_template" USING btree ("event","channel","locale");--> statement-breakpoint
CREATE INDEX "notifications_user_created_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_fs_rtype_ftype_parent" ON "files_file_system" USING btree ("resource_type","file_type","parent_id");--> statement-breakpoint
CREATE INDEX "idx_fs_rtype_ftype" ON "files_file_system" USING btree ("resource_type","file_type");--> statement-breakpoint
CREATE INDEX "idx_fs_path" ON "files_file_system" USING btree ("path");--> statement-breakpoint
CREATE INDEX "subscription_pauses_order_idx" ON "subscription_pauses" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_pauses_one_open_unique" ON "subscription_pauses" USING btree ("order_id") WHERE resumed_at is null;--> statement-breakpoint
CREATE INDEX "subscription_pauses_organization_idx" ON "subscription_pauses" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "subscription_pauses_resumed_by_idx" ON "subscription_pauses" USING btree ("resumed_by");--> statement-breakpoint
CREATE INDEX "invitation_org_idx" ON "invitation" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "invitation_email_idx" ON "invitation" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "member_org_user_unique" ON "member" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "member_user_idx" ON "member" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_client_code_unique" ON "organization" USING btree ("client_code");--> statement-breakpoint
CREATE INDEX "organization_parent_idx" ON "organization" USING btree ("parent_organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "address_tags_name_unique" ON "address_tags" USING btree ("name");--> statement-breakpoint
CREATE INDEX "address_tags_active_idx" ON "address_tags" USING btree ("active");--> statement-breakpoint
CREATE INDEX "address_tags_org_idx" ON "address_tags" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "delivery_charge_configs_org_idx" ON "delivery_charge_configs" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_strategies_group_name_unique" ON "delivery_strategies" USING btree ("group_id","name");--> statement-breakpoint
CREATE INDEX "delivery_strategies_group_idx" ON "delivery_strategies" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "delivery_strategies_connection_idx" ON "delivery_strategies" USING btree ("connection_id");--> statement-breakpoint
CREATE INDEX "delivery_strategies_active_idx" ON "delivery_strategies" USING btree ("active");--> statement-breakpoint
CREATE INDEX "delivery_strategies_org_idx" ON "delivery_strategies" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "delivery_strategy_connections_group_idx" ON "delivery_strategy_connections" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "delivery_strategy_connections_org_idx" ON "delivery_strategy_connections" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "delivery_strategy_groups_active_idx" ON "delivery_strategy_groups" USING btree ("active");--> statement-breakpoint
CREATE INDEX "delivery_strategy_groups_org_idx" ON "delivery_strategy_groups" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_zone_types_zone_type_unique" ON "delivery_zone_types" USING btree ("zone_id","type_id");--> statement-breakpoint
CREATE INDEX "delivery_zone_types_type_idx" ON "delivery_zone_types" USING btree ("type_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_addresses_one_default" ON "customer_addresses" USING btree ("user_id") WHERE "customer_addresses"."is_default" AND "customer_addresses"."archived_at" IS NULL;--> statement-breakpoint
CREATE INDEX "customer_addresses_user_idx" ON "customer_addresses" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "customer_addresses_org_idx" ON "customer_addresses" USING btree ("organization_id");--> statement-breakpoint
-- Real singleton resolver (app table now exists).
CREATE OR REPLACE FUNCTION current_app_id() RETURNS bigint LANGUAGE sql STABLE AS $fn$ SELECT id FROM app ORDER BY id LIMIT 1 $fn$;--> statement-breakpoint
-- app_id FK on every table (appId has no .references in schema to avoid an import cycle).
-- Skips any table without an app_id column so this stays correct for both apps.
DO $do$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND EXISTS (
        SELECT 1 FROM pg_attribute a
        WHERE a.attrelid = c.oid AND a.attname = 'app_id' AND a.attnum > 0 AND NOT a.attisdropped
      )
    ORDER BY c.relname
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_' || t || '_app') THEN
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (app_id) REFERENCES app(id)', t, 'fk_' || t || '_app');
    END IF;
  END LOOP;
END
$do$;
--> statement-breakpoint
-- Hand-written in the pre-squash chain (0041, 0046, 0048-0050) and not expressible in schema.ts:
-- DB-side defaults, CHECK guards and partial/extra indexes. Keep on regenerate.
ALTER TABLE "address_tags" ALTER COLUMN "public_id" SET DEFAULT ('atg_'::text || substr(md5(((random())::text || (clock_timestamp())::text)), 1, 10));--> statement-breakpoint
ALTER TABLE "address_tags" ALTER COLUMN "created_at" SET DEFAULT (EXTRACT(epoch FROM now()) * (1000)::numeric);--> statement-breakpoint
ALTER TABLE "address_tags" ALTER COLUMN "updated_at" SET DEFAULT (EXTRACT(epoch FROM now()) * (1000)::numeric);--> statement-breakpoint
ALTER TABLE "customer_addresses" ALTER COLUMN "public_id" SET DEFAULT ('adr_'::text || substr(md5(((random())::text || (clock_timestamp())::text)), 1, 10));--> statement-breakpoint
ALTER TABLE "customer_addresses" ALTER COLUMN "created_at" SET DEFAULT (EXTRACT(epoch FROM now()) * (1000)::numeric);--> statement-breakpoint
ALTER TABLE "customer_addresses" ALTER COLUMN "updated_at" SET DEFAULT (EXTRACT(epoch FROM now()) * (1000)::numeric);--> statement-breakpoint
ALTER TABLE "delivery_charge_configs" ALTER COLUMN "public_id" SET DEFAULT ('dcc_'::text || substr(md5(((random())::text || (clock_timestamp())::text)), 1, 10));--> statement-breakpoint
ALTER TABLE "delivery_charge_configs" ALTER COLUMN "created_at" SET DEFAULT (EXTRACT(epoch FROM now()) * (1000)::numeric);--> statement-breakpoint
ALTER TABLE "delivery_charge_configs" ALTER COLUMN "updated_at" SET DEFAULT (EXTRACT(epoch FROM now()) * (1000)::numeric);--> statement-breakpoint
ALTER TABLE "delivery_strategies" ALTER COLUMN "public_id" SET DEFAULT ('dsp_'::text || substr(md5(((random())::text || (clock_timestamp())::text)), 1, 10));--> statement-breakpoint
ALTER TABLE "delivery_strategies" ALTER COLUMN "created_at" SET DEFAULT (EXTRACT(epoch FROM now()) * (1000)::numeric);--> statement-breakpoint
ALTER TABLE "delivery_strategies" ALTER COLUMN "updated_at" SET DEFAULT (EXTRACT(epoch FROM now()) * (1000)::numeric);--> statement-breakpoint
ALTER TABLE "delivery_types" ALTER COLUMN "public_id" SET DEFAULT ('dty_'::text || substr(md5(((random())::text || (clock_timestamp())::text)), 1, 10));--> statement-breakpoint
ALTER TABLE "delivery_types" ALTER COLUMN "created_at" SET DEFAULT (EXTRACT(epoch FROM now()) * (1000)::numeric);--> statement-breakpoint
ALTER TABLE "delivery_types" ALTER COLUMN "updated_at" SET DEFAULT (EXTRACT(epoch FROM now()) * (1000)::numeric);--> statement-breakpoint
ALTER TABLE "delivery_zone_types" ALTER COLUMN "public_id" SET DEFAULT ('dzt_'::text || substr(md5(((random())::text || (clock_timestamp())::text)), 1, 10));--> statement-breakpoint
ALTER TABLE "delivery_zone_types" ALTER COLUMN "created_at" SET DEFAULT (EXTRACT(epoch FROM now()) * (1000)::numeric);--> statement-breakpoint
ALTER TABLE "delivery_zone_types" ALTER COLUMN "updated_at" SET DEFAULT (EXTRACT(epoch FROM now()) * (1000)::numeric);--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_nonneg_chk" CHECK ("amount" >= 0);--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_amount_nonneg_chk" CHECK ("amount" >= 0);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_total_nonneg_chk" CHECK ("total" >= 0);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_counts_positive_chk" CHECK ("persons" > 0 AND "duration_weeks" > 0 AND "tiffin_count" > 0 AND "pooled_tiffin_count" >= 0);--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_tiffin_units_nonneg_chk" CHECK ("tiffin_units" >= 0);--> statement-breakpoint
ALTER TABLE "order_addons" ADD CONSTRAINT "order_addons_qty_positive_chk" CHECK ("qty" > 0);--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_pct_range_chk" CHECK (("value_pct" IS NULL OR "value_pct" BETWEEN 0 AND 100) AND ("cap_pct" IS NULL OR "cap_pct" BETWEEN 0 AND 100) AND "redemption_count" >= 0);--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity","entity_public_id","created_at");--> statement-breakpoint
CREATE INDEX "notification_outbox_pending_idx" ON "notification_outbox" USING btree ("next_attempt_at") WHERE "status" = 'pending';--> statement-breakpoint
CREATE INDEX "notification_outbox_provider_message_idx" ON "notification_outbox" USING btree ("provider_message_id") WHERE "provider_message_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "notification_outbox_recipient_idx" ON "notification_outbox" USING btree ("recipient_id");--> statement-breakpoint
CREATE INDEX "notifications_unread_idx" ON "notifications" USING btree ("user_id") WHERE "read_at" IS NULL;--> statement-breakpoint
CREATE INDEX "session_expires_idx" ON "session" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "verification_expires_idx" ON "verification" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "customer_addresses_address_tag_idx" ON "customer_addresses" USING btree ("address_tag_id");--> statement-breakpoint
CREATE INDEX "customer_addresses_delivery_strategy_idx" ON "customer_addresses" USING btree ("delivery_strategy_id");
