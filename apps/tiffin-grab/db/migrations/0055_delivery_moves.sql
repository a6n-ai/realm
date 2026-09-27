CREATE TABLE "delivery_moves" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"order_id" bigint NOT NULL,
	"from_delivery_id" bigint,
	"to_delivery_id" bigint NOT NULL,
	"from_eat_date" date,
	"to_eat_date" date NOT NULL,
	"organization_id" text,
	CONSTRAINT "delivery_moves_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
ALTER TABLE "delivery_moves" ADD CONSTRAINT "delivery_moves_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_moves" ADD CONSTRAINT "delivery_moves_from_delivery_id_deliveries_id_fk" FOREIGN KEY ("from_delivery_id") REFERENCES "public"."deliveries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_moves" ADD CONSTRAINT "delivery_moves_to_delivery_id_deliveries_id_fk" FOREIGN KEY ("to_delivery_id") REFERENCES "public"."deliveries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_moves" ADD CONSTRAINT "delivery_moves_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "delivery_moves_order_idx" ON "delivery_moves" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "delivery_moves_from_idx" ON "delivery_moves" USING btree ("from_delivery_id");--> statement-breakpoint
CREATE INDEX "delivery_moves_to_idx" ON "delivery_moves" USING btree ("to_delivery_id");--> statement-breakpoint
CREATE INDEX "delivery_moves_organization_idx" ON "delivery_moves" USING btree ("organization_id");
