ALTER TABLE "orders" DROP COLUMN "is_student";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "weekly_fee";--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "tiffin_count" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "per_tiffin_price" numeric(10, 2) NOT NULL;
