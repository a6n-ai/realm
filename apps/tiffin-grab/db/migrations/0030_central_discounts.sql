CREATE TYPE "public"."discount_kind" AS ENUM('delivery', 'duration');--> statement-breakpoint
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
	"organization_id" text,
	CONSTRAINT "discounts_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "discounts_key_unique" UNIQUE("key"),
	CONSTRAINT "discounts_percent_range" CHECK ("discounts"."percent" >= 0 AND "discounts"."percent" <= 100)
);
--> statement-breakpoint
ALTER TABLE "app" ADD COLUMN "max_discount_pct" integer DEFAULT 25 NOT NULL;--> statement-breakpoint
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
INSERT INTO "discounts" ("public_id", "app_id", "created_at", "updated_at", "key", "name", "kind", "target_id", "percent", "organization_id")
SELECT 'dsc_' || replace(gen_random_uuid()::text, '-', ''), f."app_id", (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
       'delivery_' || f."key", 'Delivery schedule discount - ' || f."name", 'delivery', f."id", f."courier_discount_pct", f."organization_id"
FROM "delivery_frequencies" f WHERE f."courier_discount_pct" > 0
ON CONFLICT ("key") DO NOTHING;--> statement-breakpoint
INSERT INTO "discounts" ("public_id", "app_id", "created_at", "updated_at", "key", "name", "kind", "target_id", "percent", "organization_id")
SELECT 'dsc_' || replace(gen_random_uuid()::text, '-', ''), d."app_id", (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
       'duration_' || d."weeks" || 'w', 'Plan length discount - ' || d."weeks" || ' weeks', 'duration', d."id", d."discount_pct", d."organization_id"
FROM "duration_packages" d WHERE d."discount_pct" > 0
ON CONFLICT ("key") DO NOTHING;
