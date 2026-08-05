ALTER TABLE "discounts" ADD COLUMN "public_offer" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "discounts" ADD COLUMN "coupon_code" text;--> statement-breakpoint
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_coupon_code_unique" UNIQUE("coupon_code");