CREATE TABLE "promotions" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"organization_id" text,
	"title" text NOT NULL,
	"blurb" text,
	"body" text,
	"html" text,
	"image_url" text,
	"coupon_code" text,
	"cta_label" text DEFAULT 'Claim offer' NOT NULL,
	"cta_href" text,
	"placements" text[] DEFAULT '{}' NOT NULL,
	"starts_at" bigint,
	"ends_at" bigint,
	"active" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "promotions_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "promotions_active_idx" ON "promotions" USING btree ("active","priority");