CREATE TABLE "order_addons" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"order_id" bigint NOT NULL,
	"addon_key" text NOT NULL,
	"addon_name" text NOT NULL,
	"price_per_week" numeric(10, 2) NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"organization_id" text,
	CONSTRAINT "order_addons_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
ALTER TABLE "order_addons" ADD CONSTRAINT "order_addons_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_addons" ADD CONSTRAINT "order_addons_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_addons_order_idx" ON "order_addons" USING btree ("order_id");