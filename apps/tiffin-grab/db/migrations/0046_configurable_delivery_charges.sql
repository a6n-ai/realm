DO $$ BEGIN
  CREATE TYPE "delivery_charge_type" AS ENUM('none', 'fixed', 'percent');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "delivery_charge_configs" (
  "id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
  "public_id" text DEFAULT ('dcc_'::text || substr(md5(((random())::text || (clock_timestamp())::text)), 1, 10)) NOT NULL,
  "app_id" bigint DEFAULT current_app_id() NOT NULL,
  "created_at" bigint DEFAULT (EXTRACT(epoch FROM now()) * (1000)::numeric) NOT NULL,
  "updated_at" bigint DEFAULT (EXTRACT(epoch FROM now()) * (1000)::numeric) NOT NULL,
  "created_by" bigint,
  "updated_by" bigint,
  "base_charge" numeric(10, 2) DEFAULT '0.00' NOT NULL,
  "organization_id" text,
  CONSTRAINT "delivery_charge_configs_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "delivery_types" (
  "id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
  "public_id" text DEFAULT ('dtp_'::text || substr(md5(((random())::text || (clock_timestamp())::text)), 1, 10)) NOT NULL,
  "app_id" bigint DEFAULT current_app_id() NOT NULL,
  "created_at" bigint DEFAULT (EXTRACT(epoch FROM now()) * (1000)::numeric) NOT NULL,
  "updated_at" bigint DEFAULT (EXTRACT(epoch FROM now()) * (1000)::numeric) NOT NULL,
  "created_by" bigint,
  "updated_by" bigint,
  "name" text NOT NULL,
  "description" text,
  "charge_type" "delivery_charge_type" DEFAULT 'none' NOT NULL,
  "charge_value" numeric(10, 2) DEFAULT '0.00' NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "organization_id" text,
  CONSTRAINT "delivery_types_public_id_unique" UNIQUE("public_id"),
  CONSTRAINT "delivery_types_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "address_tags" (
  "id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
  "public_id" text DEFAULT ('atg_'::text || substr(md5(((random())::text || (clock_timestamp())::text)), 1, 10)) NOT NULL,
  "app_id" bigint DEFAULT current_app_id() NOT NULL,
  "created_at" bigint DEFAULT (EXTRACT(epoch FROM now()) * (1000)::numeric) NOT NULL,
  "updated_at" bigint DEFAULT (EXTRACT(epoch FROM now()) * (1000)::numeric) NOT NULL,
  "created_by" bigint,
  "updated_by" bigint,
  "name" text NOT NULL,
  "description" text,
  "charge_type" "delivery_charge_type" DEFAULT 'none' NOT NULL,
  "charge_value" numeric(10, 2) DEFAULT '0.00' NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "organization_id" text,
  CONSTRAINT "address_tags_public_id_unique" UNIQUE("public_id"),
  CONSTRAINT "address_tags_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "delivery_charge" numeric(10, 2) DEFAULT '0.00' NOT NULL;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "delivery_type_id" bigint REFERENCES "delivery_types"("id");
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "address_tag_id" bigint REFERENCES "address_tags"("id");
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "delivery_type_id" bigint REFERENCES "delivery_types"("id");
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "address_tag_id" bigint REFERENCES "address_tags"("id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "delivery_charge_configs_org_idx" ON "delivery_charge_configs" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "delivery_types_active_idx" ON "delivery_types" USING btree ("active");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "delivery_types_org_idx" ON "delivery_types" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "address_tags_active_idx" ON "address_tags" USING btree ("active");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "address_tags_org_idx" ON "address_tags" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_delivery_type_idx" ON "orders" USING btree ("delivery_type_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_address_tag_idx" ON "orders" USING btree ("address_tag_id");
