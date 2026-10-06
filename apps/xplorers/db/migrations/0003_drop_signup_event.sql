ALTER TABLE "event_payout" ALTER COLUMN "event_type" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "wallet_ledger" ALTER COLUMN "event_type" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."app_event";--> statement-breakpoint
CREATE TYPE "public"."app_event" AS ENUM('booking_paid', 'first_booking', 'birthday_booking', 'manual_adjustment');--> statement-breakpoint
ALTER TABLE "event_payout" ALTER COLUMN "event_type" SET DATA TYPE "public"."app_event" USING "event_type"::"public"."app_event";--> statement-breakpoint
ALTER TABLE "wallet_ledger" ALTER COLUMN "event_type" SET DATA TYPE "public"."app_event" USING "event_type"::"public"."app_event";