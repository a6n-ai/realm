CREATE TYPE "public"."delivery_status" AS ENUM('scheduled', 'paused', 'skipped', 'cancelled');--> statement-breakpoint
CREATE TABLE "deliveries" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"order_id" bigint NOT NULL,
	"delivery_date" date NOT NULL,
	"status" "delivery_status" DEFAULT 'scheduled' NOT NULL,
	"cutoff_at" bigint NOT NULL,
	"makeup_for_delivery_id" bigint,
	"full_name" text,
	"address_line" text,
	"city" text,
	"postal_code" text,
	"zone_id" bigint,
	CONSTRAINT "deliveries_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
ALTER TABLE "order_activities" ADD COLUMN "delivery_id" bigint;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_makeup_for_delivery_id_deliveries_id_fk" FOREIGN KEY ("makeup_for_delivery_id") REFERENCES "public"."deliveries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_zone_id_delivery_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."delivery_zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_activities" ADD CONSTRAINT "order_activities_delivery_id_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."deliveries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "deliveries_order_date_unique" ON "deliveries" USING btree ("order_id","delivery_date");--> statement-breakpoint
CREATE UNIQUE INDEX "deliveries_makeup_unique" ON "deliveries" USING btree ("makeup_for_delivery_id");--> statement-breakpoint
CREATE INDEX "deliveries_order_date_idx" ON "deliveries" USING btree ("order_id","delivery_date");--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "paused_from";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "paused_until";
