ALTER TABLE "addons" ADD COLUMN "tu_amount" numeric(6, 2) DEFAULT '1' NOT NULL;--> statement-breakpoint
ALTER TABLE "order_addons" ADD COLUMN "category" text NOT NULL;--> statement-breakpoint
ALTER TABLE "order_addons" ADD COLUMN "tu_amount" numeric(6, 2) NOT NULL;