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
	"radius_km" numeric(6, 2) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "delivery_zones_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
ALTER TABLE "app" ADD COLUMN "store_lat" numeric(9, 6);--> statement-breakpoint
ALTER TABLE "app" ADD COLUMN "store_lng" numeric(9, 6);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivery_type_id" bigint;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivery_zone_id" bigint;--> statement-breakpoint
ALTER TABLE "delivery_zone_types" ADD CONSTRAINT "delivery_zone_types_zone_id_delivery_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."delivery_zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_zone_types" ADD CONSTRAINT "delivery_zone_types_type_id_delivery_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."delivery_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_zone_types_zone_type_unique" ON "delivery_zone_types" USING btree ("zone_id","type_id");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_delivery_type_id_delivery_types_id_fk" FOREIGN KEY ("delivery_type_id") REFERENCES "public"."delivery_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_delivery_zone_id_delivery_zones_id_fk" FOREIGN KEY ("delivery_zone_id") REFERENCES "public"."delivery_zones"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
-- Seed data reproducing today's live delivery behaviour. $defaultFn does not fire
-- for raw SQL, so public_id/created_at/updated_at are supplied explicitly. app_id
-- defaults to current_app_id(), which is NULL until the "app" singleton row
-- exists — guard every seed with WHERE EXISTS so a fresh database (no app row)
-- migrates cleanly without seeding, instead of failing the NOT NULL constraint.
INSERT INTO "delivery_types"
  ("public_id","created_at","updated_at","key","label","requires_address","requires_schedule","min_subtotal","discount_pct","sort_order")
SELECT v.public_id, ms.t, ms.t, v.key, v.label, v.req_addr, v.req_sched, v.min_sub, v.disc, v.sort
FROM (SELECT (EXTRACT(EPOCH FROM now())*1000)::bigint AS t) ms,
     (VALUES
       ('dty_pickup',    'pickup',    'Pickup',             false, false,  0::numeric,  0::numeric, 0),
       ('dty_instant',   'instant',   'Instant delivery',   true,  false,  0::numeric, 15::numeric, 1),
       ('dty_scheduled', 'scheduled', 'Scheduled delivery', true,  true,  35::numeric,  0::numeric, 2)
     ) AS v(public_id, key, label, req_addr, req_sched, min_sub, disc, sort)
WHERE EXISTS (SELECT 1 FROM "app");
--> statement-breakpoint
INSERT INTO "delivery_zones" ("public_id","created_at","updated_at","name","radius_km")
SELECT v.public_id, ms.t, ms.t, v.name, v.radius
FROM (SELECT (EXTRACT(EPOCH FROM now())*1000)::bigint AS t) ms,
     (VALUES
       ('zon_inner', 'Inner',  7.00::numeric),
       ('zon_outer', 'Outer', 20.00::numeric)
     ) AS v(public_id, name, radius)
WHERE EXISTS (SELECT 1 FROM "app");
--> statement-breakpoint
INSERT INTO "delivery_zone_types" ("public_id","created_at","updated_at","zone_id","type_id")
SELECT 'dzt_' || lower(z.name) || '_' || t.key,
       (EXTRACT(EPOCH FROM now())*1000)::bigint, (EXTRACT(EPOCH FROM now())*1000)::bigint,
       z.id, t.id
FROM "delivery_zones" z
JOIN "delivery_types" t
  ON (z.name = 'Inner' AND t.key IN ('instant','scheduled'))
  OR (z.name = 'Outer' AND t.key = 'scheduled');