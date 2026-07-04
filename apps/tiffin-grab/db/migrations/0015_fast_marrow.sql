ALTER TABLE "dishes" ADD COLUMN "image" jsonb;--> statement-breakpoint
UPDATE "dishes" SET "image" = jsonb_build_object('url', "image_url") WHERE "image_url" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "dishes" DROP COLUMN "image_url";
