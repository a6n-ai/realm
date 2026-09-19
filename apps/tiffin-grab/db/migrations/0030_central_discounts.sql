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
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;
