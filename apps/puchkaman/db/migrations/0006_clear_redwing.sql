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
	"fee_amount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"discount_pct" numeric(5, 2) DEFAULT '0' NOT NULL,
	"min_subtotal" numeric(10, 2) DEFAULT '0' NOT NULL,
	"requires_scheduling" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "delivery_zones_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
ALTER TABLE "app" ADD COLUMN "store_lat" numeric(9, 6);--> statement-breakpoint
ALTER TABLE "app" ADD COLUMN "store_lng" numeric(9, 6);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivery_fee" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivery_zone_id" bigint;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_delivery_zone_id_delivery_zones_id_fk" FOREIGN KEY ("delivery_zone_id") REFERENCES "public"."delivery_zones"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
INSERT INTO "delivery_zones" ("name", "radius_km", "fee_amount", "discount_pct", "min_subtotal", "requires_scheduling")
VALUES ('Standard', 7.00, 0, 15.00, 0, false);