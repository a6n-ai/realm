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
