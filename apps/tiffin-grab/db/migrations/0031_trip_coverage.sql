ALTER TABLE "deliveries" ADD COLUMN "covers_dates" text[];--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN "merged_into_delivery_id" bigint;--> statement-breakpoint
ALTER TABLE "inquiries" ADD COLUMN "frequency_key_interest" text;--> statement-breakpoint
ALTER TABLE "inquiries" ADD COLUMN "eating_days_interest" text[];--> statement-breakpoint
ALTER TABLE "delivery_category_swaps" ADD COLUMN "for_date" date;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_merged_into_delivery_id_deliveries_id_fk" FOREIGN KEY ("merged_into_delivery_id") REFERENCES "public"."deliveries"("id") ON DELETE no action ON UPDATE no action;