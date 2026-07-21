ALTER TYPE "public"."payment_status" ADD VALUE 'awaiting_payment';--> statement-breakpoint
ALTER TYPE "public"."payment_status" ADD VALUE 'pending_verification';--> statement-breakpoint
ALTER TYPE "public"."payment_status" ADD VALUE 'paid';--> statement-breakpoint
ALTER TYPE "public"."payment_status" ADD VALUE 'rejected';--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "reference" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "proof" jsonb;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "claimed_at" bigint;--> statement-breakpoint
ALTER TABLE "coupons" ADD COLUMN "allowed_payment_methods" text[] DEFAULT '{}' NOT NULL;