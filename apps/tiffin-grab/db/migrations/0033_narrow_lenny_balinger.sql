CREATE TABLE "delivery_extra_tiffins" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"delivery_id" bigint NOT NULL,
	"eat_date" date NOT NULL,
	"organization_id" text,
	CONSTRAINT "delivery_extra_tiffins_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
ALTER TABLE "delivery_extra_tiffins" ADD CONSTRAINT "delivery_extra_tiffins_delivery_id_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."deliveries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_extra_tiffins" ADD CONSTRAINT "delivery_extra_tiffins_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "delivery_extra_tiffins_delivery_idx" ON "delivery_extra_tiffins" USING btree ("delivery_id");--> statement-breakpoint
CREATE INDEX "delivery_extra_tiffins_organization_idx" ON "delivery_extra_tiffins" USING btree ("organization_id");