ALTER TABLE "products" ADD COLUMN "clover_sku" text;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "clover_code" text;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "clover_alternate_name" text;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "clover_price_type" text;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "clover_hidden" boolean;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "clover_available" boolean;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "clover_auto_manage" boolean;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "clover_cost" numeric(10, 2);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "clover_unit_name" text;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "clover_color_code" text;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "clover_stock_qty" numeric(12, 3);
