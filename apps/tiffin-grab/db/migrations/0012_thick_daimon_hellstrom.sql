ALTER TABLE "addons" ADD COLUMN "max_qty" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "order_addons" ADD COLUMN "qty" integer DEFAULT 1 NOT NULL;