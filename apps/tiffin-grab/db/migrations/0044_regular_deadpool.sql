CREATE TYPE "public"."inquiry_sub_status" AS ENUM('no_response', 'responded', 'lost', 'undeliverable', 'future', 'persistent', 'expected', 'pending_payment', 'took_plan', 'took_trial');--> statement-breakpoint
ALTER TYPE "public"."inquiry_lost_reason" ADD VALUE 'asked_to_stop';--> statement-breakpoint
ALTER TABLE "inquiries" ALTER COLUMN "full_name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "inquiries" ALTER COLUMN "phone" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "inquiries" ADD COLUMN "sub_status" "inquiry_sub_status";--> statement-breakpoint
ALTER TABLE "inquiries" ADD COLUMN "next_follow_up_at" bigint;--> statement-breakpoint
ALTER TABLE "inquiry_activities" ADD COLUMN "from_sub_status" "inquiry_sub_status";--> statement-breakpoint
ALTER TABLE "inquiry_activities" ADD COLUMN "to_sub_status" "inquiry_sub_status";--> statement-breakpoint
CREATE INDEX "inquiries_next_follow_up_idx" ON "inquiries" USING btree ("next_follow_up_at");--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_name_or_phone" CHECK (coalesce(nullif(trim("inquiries"."full_name"), ''), nullif(trim("inquiries"."phone"), '')) is not null);