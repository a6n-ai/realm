ALTER TABLE IF EXISTS "address_tags" RENAME TO "delivery_tags";
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "delivery_tags" RENAME CONSTRAINT "address_tags_public_id_unique" TO "delivery_tags_public_id_unique";
EXCEPTION
  WHEN undefined_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "delivery_tags" RENAME CONSTRAINT "address_tags_name_unique" TO "delivery_tags_name_unique";
EXCEPTION
  WHEN undefined_object THEN null;
END $$;
--> statement-breakpoint
ALTER INDEX IF EXISTS "address_tags_active_idx" RENAME TO "delivery_tags_active_idx";
--> statement-breakpoint
ALTER INDEX IF EXISTS "address_tags_org_idx" RENAME TO "delivery_tags_org_idx";
--> statement-breakpoint
ALTER TABLE IF EXISTS "delivery_types" RENAME TO "delivery_options";
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "delivery_options" RENAME CONSTRAINT "delivery_types_public_id_unique" TO "delivery_options_public_id_unique";
EXCEPTION
  WHEN undefined_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "delivery_options" DROP CONSTRAINT IF EXISTS "delivery_types_name_unique";
EXCEPTION
  WHEN undefined_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "delivery_options" ADD COLUMN IF NOT EXISTS "tag_id" bigint REFERENCES "delivery_tags"("id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "delivery_options_name_tag_unique" ON "delivery_options" ("name", "tag_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "delivery_options_tag_idx" ON "delivery_options" ("tag_id");
--> statement-breakpoint
ALTER INDEX IF EXISTS "delivery_types_active_idx" RENAME TO "delivery_options_active_idx";
--> statement-breakpoint
ALTER INDEX IF EXISTS "delivery_types_org_idx" RENAME TO "delivery_options_org_idx";
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "delivery_option_id" bigint REFERENCES "delivery_options"("id");
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "delivery_tag_id" bigint REFERENCES "delivery_tags"("id");
--> statement-breakpoint
UPDATE "orders" SET "delivery_option_id" = "delivery_type_id", "delivery_tag_id" = "address_tag_id" WHERE "delivery_option_id" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_delivery_option_idx" ON "orders" ("delivery_option_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_delivery_tag_idx" ON "orders" ("delivery_tag_id");
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "delivery_option_id" bigint REFERENCES "delivery_options"("id");
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "delivery_tag_id" bigint REFERENCES "delivery_tags"("id");
--> statement-breakpoint
UPDATE "users" SET "delivery_option_id" = "delivery_type_id", "delivery_tag_id" = "address_tag_id" WHERE "delivery_option_id" IS NULL;
