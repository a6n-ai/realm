CREATE TABLE "customer_addresses" (
  "id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
  "public_id" text DEFAULT ('adr_'::text || substr(md5(((random())::text || (clock_timestamp())::text)), 1, 10)) NOT NULL,
  "app_id" bigint DEFAULT current_app_id() NOT NULL,
  "created_at" bigint DEFAULT (EXTRACT(epoch FROM now()) * (1000)::numeric) NOT NULL,
  "updated_at" bigint DEFAULT (EXTRACT(epoch FROM now()) * (1000)::numeric) NOT NULL,
  "created_by" bigint,
  "updated_by" bigint,
  "user_id" bigint NOT NULL REFERENCES "users"("id"),
  "label" text NOT NULL,
  "full_name" text,
  "address_line" text NOT NULL,
  "address_unit" text,
  "city" text NOT NULL,
  "province" text,
  "postal_code" text NOT NULL,
  "delivery_instructions" text,
  "lat" numeric(9, 6),
  "lng" numeric(9, 6),
  "is_default" boolean DEFAULT false NOT NULL,
  "archived_at" bigint,
  "organization_id" text REFERENCES "organization"("id"),
  "address_tag_id" bigint REFERENCES "address_tags"("id"),
  "delivery_strategy_id" bigint REFERENCES "delivery_strategies"("id"),
  CONSTRAINT "customer_addresses_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "customer_addresses_one_default" ON "customer_addresses" USING btree ("user_id") WHERE "is_default" AND "archived_at" IS NULL;
--> statement-breakpoint
CREATE INDEX "customer_addresses_user_idx" ON "customer_addresses" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "customer_addresses_org_idx" ON "customer_addresses" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX "customer_addresses_address_tag_idx" ON "customer_addresses" USING btree ("address_tag_id");
--> statement-breakpoint
CREATE INDEX "customer_addresses_delivery_strategy_idx" ON "customer_addresses" USING btree ("delivery_strategy_id");
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "address_id" bigint REFERENCES "customer_addresses"("id");
--> statement-breakpoint
CREATE INDEX "orders_address_idx" ON "orders" USING btree ("address_id");
--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN "address_id" bigint REFERENCES "customer_addresses"("id");
--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN "address_unit" text;
--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN "delivery_instructions" text;
--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN "delivery_strategy_id" bigint REFERENCES "delivery_strategies"("id");
--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN "address_tag_id" bigint REFERENCES "address_tags"("id");
--> statement-breakpoint
CREATE INDEX "deliveries_address_idx" ON "deliveries" USING btree ("address_id");
--> statement-breakpoint
CREATE INDEX "deliveries_delivery_strategy_idx" ON "deliveries" USING btree ("delivery_strategy_id");
--> statement-breakpoint
CREATE INDEX "deliveries_address_tag_idx" ON "deliveries" USING btree ("address_tag_id");
