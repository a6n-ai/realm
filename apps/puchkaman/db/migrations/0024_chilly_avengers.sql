ALTER TABLE "products" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "discounts" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "menu_items" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "menu_sections" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "menus" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "modifier_groups" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "modifiers" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "printer_labels" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "product_categories" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "tax_rates" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "delivery_types" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "delivery_zones" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "carts" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_sections" ADD CONSTRAINT "menu_sections_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menus" ADD CONSTRAINT "menus_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modifier_groups" ADD CONSTRAINT "modifier_groups_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modifiers" ADD CONSTRAINT "modifiers_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "printer_labels" ADD CONSTRAINT "printer_labels_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_rates" ADD CONSTRAINT "tax_rates_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_types" ADD CONSTRAINT "delivery_types_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_zones" ADD CONSTRAINT "delivery_zones_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carts" ADD CONSTRAINT "carts_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ledger_organization_idx" ON "ledger_entries" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "orders_organization_idx" ON "orders" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "payments_organization_idx" ON "payments" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "carts_organization_idx" ON "carts" USING btree ("organization_id");