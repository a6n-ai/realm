ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "products_slug_unique";--> statement-breakpoint
ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "products_external_id_unique";--> statement-breakpoint
ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "products_clover_item_id_unique";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "products_org_slug_unique" ON "products" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "products_org_external_id_unique" ON "products" USING btree ("organization_id","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "products_org_clover_item_id_unique" ON "products" USING btree ("organization_id","clover_item_id");