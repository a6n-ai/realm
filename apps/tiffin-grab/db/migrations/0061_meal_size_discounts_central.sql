ALTER TYPE "public"."discount_kind" ADD VALUE 'meal_size';--> statement-breakpoint
ALTER TABLE "discounts" ADD COLUMN "amount" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "meal_sizes" DROP COLUMN "discount_type";--> statement-breakpoint
ALTER TABLE "meal_sizes" DROP COLUMN "discount_value";--> statement-breakpoint
DROP TYPE "public"."meal_size_discount_type";