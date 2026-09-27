CREATE TYPE "public"."meal_rule_action" AS ENUM('max_qualifying', 'forbid', 'cannot_coexist');--> statement-breakpoint
CREATE TYPE "public"."meal_rule_condition" AS ENUM('exclusive_to_plan');--> statement-breakpoint
CREATE TYPE "public"."meal_rule_field" AS ENUM('dish_plan', 'category', 'dish', 'dish_name');--> statement-breakpoint
CREATE TYPE "public"."meal_rule_match_mode" AS ENUM('all', 'any');--> statement-breakpoint
CREATE TYPE "public"."meal_rule_operator" AS ENUM('is', 'is_not', 'is_one_of', 'is_not_one_of', 'contains', 'not_contains', 'equals', 'starts_with', 'ends_with');--> statement-breakpoint
CREATE TYPE "public"."delivery_charge_type" AS ENUM('none', 'fixed', 'percent');--> statement-breakpoint
ALTER TYPE "public"."app_event" ADD VALUE 'staff_invitation';--> statement-breakpoint
ALTER TYPE "public"."app_event" ADD VALUE 'customer_invitation';--> statement-breakpoint
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
ALTER TABLE "dish_plans" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "category_swap_pair_plans" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "dish_plans" CASCADE;--> statement-breakpoint
DROP TABLE "category_swap_pair_plans" CASCADE;--> statement-breakpoint
ALTER TABLE "user_feature_flags" DROP CONSTRAINT "user_feature_flags_user_flag_uq";--> statement-breakpoint
ALTER TABLE "delivery_zones" DROP CONSTRAINT "delivery_zones_name_unique";--> statement-breakpoint
ALTER TABLE "inquiry_user_config" DROP CONSTRAINT "inquiry_user_config_user_source_unq";--> statement-breakpoint
DROP INDEX "deliveries_order_date_idx";--> statement-breakpoint
DROP INDEX "coupons_rep_daily_unq";--> statement-breakpoint
DROP INDEX "ledger_user_created_idx";--> statement-breakpoint
DROP INDEX "ledger_order_idx";--> statement-breakpoint
DROP INDEX "ledger_organization_idx";--> statement-breakpoint
DROP INDEX "inquiries_open_phone_source_uq";--> statement-breakpoint
DROP INDEX "subscription_pauses_one_open_uniq";--> statement-breakpoint
DROP INDEX "category_swap_pairs_pair_unique";--> statement-breakpoint
ALTER TABLE "delivery_zones" ALTER COLUMN "postal_prefixes" SET DEFAULT '{}'::text[];--> statement-breakpoint
ALTER TABLE "delivery_zones" ALTER COLUMN "slot_window" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "active_organization_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "delivery_strategy_id" bigint;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "address_tag_id" bigint;--> statement-breakpoint
ALTER TABLE "delivery_zones" ADD COLUMN "radius_km" numeric(6, 2);--> statement-breakpoint
ALTER TABLE "dishes" ADD COLUMN "plan_id" bigint NOT NULL;--> statement-breakpoint
ALTER TABLE "meal_size_items" ADD COLUMN "plan_id" bigint NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "address_id" bigint;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivery_charge" numeric(10, 2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivery_strategy_id" bigint;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivery_strategy_ids" bigint[] DEFAULT '{}'::bigint[] NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivery_tag_id" bigint;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "address_tag_id" bigint;--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN "address_id" bigint;--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN "address_unit" text;--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN "delivery_instructions" text;--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN "delivery_strategy_id" bigint;--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN "delivery_strategy_ids" bigint[] DEFAULT '{}'::bigint[] NOT NULL;--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN "delivery_tag_id" bigint;--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN "address_tag_id" bigint;--> statement-breakpoint
ALTER TABLE "category_swap_pairs" ADD COLUMN "plan_id" bigint;--> statement-breakpoint
ALTER TABLE "category_swap_pairs" ADD COLUMN "exchange_overrides" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "delivery_category_swaps" ADD COLUMN "from_row" integer;--> statement-breakpoint
ALTER TABLE "delivery_category_swaps" ADD COLUMN "receive_tu" numeric(6, 2);--> statement-breakpoint
ALTER TABLE "app" ADD COLUMN "max_coin_redeem_pct_of_balance" integer;--> statement-breakpoint
ALTER TABLE "invitation" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "meal_rule_conditions" ADD CONSTRAINT "meal_rule_conditions_rule_id_meal_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."meal_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_rule_conditions" ADD CONSTRAINT "meal_rule_conditions_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_rules" ADD CONSTRAINT "meal_rules_scope_plan_id_plans_id_fk" FOREIGN KEY ("scope_plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_rules" ADD CONSTRAINT "meal_rules_scope_meal_size_id_meal_sizes_id_fk" FOREIGN KEY ("scope_meal_size_id") REFERENCES "public"."meal_sizes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_rules" ADD CONSTRAINT "meal_rules_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_rules" ADD CONSTRAINT "meal_rules_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_moves" ADD CONSTRAINT "delivery_moves_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_moves" ADD CONSTRAINT "delivery_moves_from_delivery_id_deliveries_id_fk" FOREIGN KEY ("from_delivery_id") REFERENCES "public"."deliveries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_moves" ADD CONSTRAINT "delivery_moves_to_delivery_id_deliveries_id_fk" FOREIGN KEY ("to_delivery_id") REFERENCES "public"."deliveries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_moves" ADD CONSTRAINT "delivery_moves_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
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
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_address_tag_id_address_tags_id_fk" FOREIGN KEY ("address_tag_id") REFERENCES "public"."address_tags"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_delivery_strategy_id_delivery_strategies_id_fk" FOREIGN KEY ("delivery_strategy_id") REFERENCES "public"."delivery_strategies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_delivery_tag_id_delivery_strategy_groups_id_fk" FOREIGN KEY ("delivery_tag_id") REFERENCES "public"."delivery_strategy_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meal_rule_conditions_rule_idx" ON "meal_rule_conditions" USING btree ("rule_id");--> statement-breakpoint
CREATE INDEX "meal_rules_scope_plan_idx" ON "meal_rules" USING btree ("scope_plan_id");--> statement-breakpoint
CREATE INDEX "meal_rules_scope_meal_size_idx" ON "meal_rules" USING btree ("scope_meal_size_id");--> statement-breakpoint
CREATE INDEX "meal_rules_plan_idx" ON "meal_rules" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "delivery_moves_order_idx" ON "delivery_moves" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "delivery_moves_from_idx" ON "delivery_moves" USING btree ("from_delivery_id");--> statement-breakpoint
CREATE INDEX "delivery_moves_to_idx" ON "delivery_moves" USING btree ("to_delivery_id");--> statement-breakpoint
CREATE INDEX "delivery_moves_organization_idx" ON "delivery_moves" USING btree ("organization_id");--> statement-breakpoint
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
ALTER TABLE "users" ADD CONSTRAINT "users_delivery_strategy_id_delivery_strategies_id_fk" FOREIGN KEY ("delivery_strategy_id") REFERENCES "public"."delivery_strategies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_address_tag_id_address_tags_id_fk" FOREIGN KEY ("address_tag_id") REFERENCES "public"."address_tags"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dishes" ADD CONSTRAINT "dishes_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_size_items" ADD CONSTRAINT "meal_size_items_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_address_id_customer_addresses_id_fk" FOREIGN KEY ("address_id") REFERENCES "public"."customer_addresses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_delivery_strategy_id_delivery_strategies_id_fk" FOREIGN KEY ("delivery_strategy_id") REFERENCES "public"."delivery_strategies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_delivery_tag_id_delivery_strategy_groups_id_fk" FOREIGN KEY ("delivery_tag_id") REFERENCES "public"."delivery_strategy_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_address_tag_id_address_tags_id_fk" FOREIGN KEY ("address_tag_id") REFERENCES "public"."address_tags"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_address_id_customer_addresses_id_fk" FOREIGN KEY ("address_id") REFERENCES "public"."customer_addresses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_delivery_strategy_id_delivery_strategies_id_fk" FOREIGN KEY ("delivery_strategy_id") REFERENCES "public"."delivery_strategies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_delivery_tag_id_delivery_strategy_groups_id_fk" FOREIGN KEY ("delivery_tag_id") REFERENCES "public"."delivery_strategy_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_address_tag_id_address_tags_id_fk" FOREIGN KEY ("address_tag_id") REFERENCES "public"."address_tags"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_swap_pairs" ADD CONSTRAINT "category_swap_pairs_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_feature_flags_flag_idx" ON "user_feature_flags" USING btree ("flag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dishes_name_unique" ON "dishes" USING btree ("name");--> statement-breakpoint
CREATE INDEX "dishes_plan_idx" ON "dishes" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "meal_size_items_meal_size_idx" ON "meal_size_items" USING btree ("meal_size_id");--> statement-breakpoint
CREATE INDEX "meal_size_items_plan_idx" ON "meal_size_items" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "meal_sizes_plan_idx" ON "meal_sizes" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "order_activities_delivery_idx" ON "order_activities" USING btree ("delivery_id");--> statement-breakpoint
CREATE INDEX "orders_plan_idx" ON "orders" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "orders_zone_idx" ON "orders" USING btree ("zone_id");--> statement-breakpoint
CREATE INDEX "orders_meal_size_idx" ON "orders" USING btree ("meal_size_id");--> statement-breakpoint
CREATE INDEX "orders_frequency_idx" ON "orders" USING btree ("frequency_id");--> statement-breakpoint
CREATE INDEX "orders_delivery_strategy_idx" ON "orders" USING btree ("delivery_strategy_id");--> statement-breakpoint
CREATE INDEX "orders_address_tag_idx" ON "orders" USING btree ("address_tag_id");--> statement-breakpoint
CREATE INDEX "orders_address_idx" ON "orders" USING btree ("address_id");--> statement-breakpoint
CREATE INDEX "payments_status_idx" ON "payments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "deliveries_date_idx" ON "deliveries" USING btree ("delivery_date");--> statement-breakpoint
CREATE INDEX "deliveries_zone_idx" ON "deliveries" USING btree ("zone_id");--> statement-breakpoint
CREATE INDEX "deliveries_address_idx" ON "deliveries" USING btree ("address_id");--> statement-breakpoint
CREATE INDEX "deliveries_delivery_strategy_idx" ON "deliveries" USING btree ("delivery_strategy_id");--> statement-breakpoint
CREATE INDEX "deliveries_address_tag_idx" ON "deliveries" USING btree ("address_tag_id");--> statement-breakpoint
CREATE INDEX "deliveries_merged_into_idx" ON "deliveries" USING btree ("merged_into_delivery_id") WHERE "deliveries"."merged_into_delivery_id" is not null;--> statement-breakpoint
CREATE INDEX "coupon_redemptions_redeemed_by_idx" ON "coupon_redemptions" USING btree ("redeemed_by");--> statement-breakpoint
CREATE UNIQUE INDEX "coupons_rep_daily_unique" ON "coupons" USING btree ("owner_user_id","ist_date") WHERE "coupons"."kind" = 'rep_daily';--> statement-breakpoint
CREATE INDEX "ledger_entries_user_created_idx" ON "ledger_entries" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "ledger_entries_order_idx" ON "ledger_entries" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_organization_idx" ON "ledger_entries" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_payment_idx" ON "ledger_entries" USING btree ("payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inquiries_open_phone_source_unique" ON "inquiries" USING btree (lower("phone"),"source_id") WHERE "inquiries"."stage" not in ('converted', 'lost');--> statement-breakpoint
CREATE INDEX "inquiries_stage_created_idx" ON "inquiries" USING btree ("stage","created_at");--> statement-breakpoint
CREATE INDEX "inquiries_source_idx" ON "inquiries" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "inquiries_converted_order_idx" ON "inquiries" USING btree ("converted_order_id");--> statement-breakpoint
CREATE INDEX "inquiries_sub_source_idx" ON "inquiries" USING btree ("sub_source_id");--> statement-breakpoint
CREATE INDEX "inquiries_zone_idx" ON "inquiries" USING btree ("zone_id");--> statement-breakpoint
CREATE INDEX "ticket_messages_author_idx" ON "ticket_messages" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "tickets_order_idx" ON "tickets" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "category_plans_plan_idx" ON "category_plans" USING btree ("plan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "category_swap_pairs_pair_null_plan_unique" ON "category_swap_pairs" USING btree ("from_category_id","to_category_id") WHERE "category_swap_pairs"."plan_id" IS NULL;--> statement-breakpoint
CREATE INDEX "category_swap_pairs_to_category_idx" ON "category_swap_pairs" USING btree ("to_category_id");--> statement-breakpoint
CREATE INDEX "category_swap_pairs_plan_idx" ON "category_swap_pairs" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "dish_category_addon_categories_addon_category_idx" ON "dish_category_addon_categories" USING btree ("addon_category_id");--> statement-breakpoint
CREATE INDEX "meal_selections_menu_week_idx" ON "meal_selections" USING btree ("menu_week_id");--> statement-breakpoint
CREATE INDEX "meal_selections_category_idx" ON "meal_selections" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "meal_selections_dish_idx" ON "meal_selections" USING btree ("dish_id");--> statement-breakpoint
CREATE INDEX "menu_items_dish_idx" ON "menu_items" USING btree ("dish_id");--> statement-breakpoint
CREATE INDEX "meal_payout_duration_package_idx" ON "meal_payout" USING btree ("duration_package_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_pauses_one_open_unique" ON "subscription_pauses" USING btree ("order_id") WHERE resumed_at is null;--> statement-breakpoint
CREATE INDEX "subscription_pauses_resumed_by_idx" ON "subscription_pauses" USING btree ("resumed_by");--> statement-breakpoint
CREATE UNIQUE INDEX "category_swap_pairs_pair_unique" ON "category_swap_pairs" USING btree ("from_category_id","to_category_id","plan_id");--> statement-breakpoint
ALTER TABLE "plans" DROP COLUMN "restricted";--> statement-breakpoint
ALTER TABLE "user_feature_flags" ADD CONSTRAINT "user_feature_flags_user_flag_unique" UNIQUE("user_id","flag_id");--> statement-breakpoint
ALTER TABLE "inquiry_user_config" ADD CONSTRAINT "inquiry_user_config_user_source_unique" UNIQUE("user_id","source_id");--> statement-breakpoint
ALTER TABLE "delivery_zones" ADD CONSTRAINT "delivery_zones_shape_check" CHECK (("delivery_zones"."radius_km" IS NULL) <> (cardinality("delivery_zones"."postal_prefixes") = 0));