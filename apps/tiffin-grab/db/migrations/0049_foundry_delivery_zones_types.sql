ALTER TABLE "delivery_zones" ADD COLUMN "radius_km" numeric(6, 2);
--> statement-breakpoint
ALTER TABLE "delivery_zones" ALTER COLUMN "slot_window" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "delivery_zones" ALTER COLUMN "postal_prefixes" SET DEFAULT '{}'::text[];
--> statement-breakpoint
ALTER TABLE "delivery_zones" ADD CONSTRAINT "delivery_zones_shape_check" CHECK (("radius_km" IS NULL) <> (cardinality("postal_prefixes") = 0));
--> statement-breakpoint
ALTER TABLE "delivery_charge_configs" ADD COLUMN "store_lat" numeric(9, 6);
--> statement-breakpoint
ALTER TABLE "delivery_charge_configs" ADD COLUMN "store_lng" numeric(9, 6);
--> statement-breakpoint
CREATE TABLE "delivery_types" (
  "id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
  "public_id" text DEFAULT ('dty_'::text || substr(md5(((random())::text || (clock_timestamp())::text)), 1, 10)) NOT NULL,
  "app_id" bigint DEFAULT current_app_id() NOT NULL,
  "created_at" bigint DEFAULT (EXTRACT(epoch FROM now()) * (1000)::numeric) NOT NULL,
  "updated_at" bigint DEFAULT (EXTRACT(epoch FROM now()) * (1000)::numeric) NOT NULL,
  "created_by" bigint,
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
  "organization_id" text REFERENCES "organization"("id"),
  CONSTRAINT "delivery_types_public_id_unique" UNIQUE("public_id"),
  CONSTRAINT "delivery_types_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "delivery_zone_types" (
  "id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
  "public_id" text DEFAULT ('dzt_'::text || substr(md5(((random())::text || (clock_timestamp())::text)), 1, 10)) NOT NULL,
  "app_id" bigint DEFAULT current_app_id() NOT NULL,
  "created_at" bigint DEFAULT (EXTRACT(epoch FROM now()) * (1000)::numeric) NOT NULL,
  "updated_at" bigint DEFAULT (EXTRACT(epoch FROM now()) * (1000)::numeric) NOT NULL,
  "created_by" bigint,
  "updated_by" bigint,
  "zone_id" bigint NOT NULL REFERENCES "delivery_zones"("id"),
  "type_id" bigint NOT NULL REFERENCES "delivery_types"("id"),
  CONSTRAINT "delivery_zone_types_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_zone_types_zone_type_unique" ON "delivery_zone_types" USING btree ("zone_id", "type_id");
--> statement-breakpoint
CREATE INDEX "delivery_zone_types_type_idx" ON "delivery_zone_types" USING btree ("type_id");
