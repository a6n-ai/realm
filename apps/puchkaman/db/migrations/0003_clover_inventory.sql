ALTER TABLE "products" ADD COLUMN "clover_item_id" text;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "clover_last_synced_at" bigint;
--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_clover_item_id_unique" UNIQUE("clover_item_id");
