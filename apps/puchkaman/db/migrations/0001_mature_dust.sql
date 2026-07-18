CREATE TYPE "public"."product_source" AS ENUM('manual', 'uber_eats');--> statement-breakpoint
CREATE TYPE "public"."product_sync_status" AS ENUM('none', 'synced', 'update_available');--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "slug" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "display_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "featured" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "source" "product_source" DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "last_synced_at" bigint;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "sync_status" "product_sync_status" DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "pending_sync" jsonb;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_slug_unique" UNIQUE("slug");--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_external_id_unique" UNIQUE("external_id");