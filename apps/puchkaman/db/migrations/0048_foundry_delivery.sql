CREATE TYPE "public"."delivery_charge_type" AS ENUM('none', 'fixed', 'percent');--> statement-breakpoint
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
	CONSTRAINT "delivery_strategies_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
ALTER TABLE "delivery_zones" ALTER COLUMN "radius_km" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "delivery_zones" ADD COLUMN "postal_prefixes" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "delivery_zones" ADD COLUMN "slot_window" text;--> statement-breakpoint
ALTER TABLE "address_tags" ADD CONSTRAINT "address_tags_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_charge_configs" ADD CONSTRAINT "delivery_charge_configs_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_strategies" ADD CONSTRAINT "delivery_strategies_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "address_tags_name_unique" ON "address_tags" USING btree ("name");--> statement-breakpoint
CREATE INDEX "address_tags_active_idx" ON "address_tags" USING btree ("active");--> statement-breakpoint
CREATE INDEX "address_tags_org_idx" ON "address_tags" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "delivery_charge_configs_org_idx" ON "delivery_charge_configs" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_strategies_name_unique" ON "delivery_strategies" USING btree ("name");--> statement-breakpoint
CREATE INDEX "delivery_strategies_active_idx" ON "delivery_strategies" USING btree ("active");--> statement-breakpoint
CREATE INDEX "delivery_strategies_org_idx" ON "delivery_strategies" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "delivery_zone_types_type_idx" ON "delivery_zone_types" USING btree ("type_id");--> statement-breakpoint
ALTER TABLE "delivery_zones" ADD CONSTRAINT "delivery_zones_shape_check" CHECK (("delivery_zones"."radius_km" IS NULL) <> (cardinality("delivery_zones"."postal_prefixes") = 0));