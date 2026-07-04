ALTER TYPE "public"."business_event" RENAME TO "app_event";--> statement-breakpoint
ALTER TYPE "public"."app_event" ADD VALUE IF NOT EXISTS 'order_cancelled';--> statement-breakpoint
ALTER TYPE "public"."app_event" ADD VALUE IF NOT EXISTS 'order_paused';--> statement-breakpoint
ALTER TYPE "public"."app_event" ADD VALUE IF NOT EXISTS 'payment_received';--> statement-breakpoint
ALTER TYPE "public"."app_event" ADD VALUE IF NOT EXISTS 'refund_issued';--> statement-breakpoint
ALTER TYPE "public"."app_event" ADD VALUE IF NOT EXISTS 'menu_released';--> statement-breakpoint
ALTER TYPE "public"."app_event" ADD VALUE IF NOT EXISTS 'wallet_credited';--> statement-breakpoint
ALTER TYPE "public"."app_event" ADD VALUE IF NOT EXISTS 'wallet_redeemed';--> statement-breakpoint
ALTER TYPE "public"."app_event" ADD VALUE IF NOT EXISTS 'inquiry_created';--> statement-breakpoint
ALTER TYPE "public"."app_event" ADD VALUE IF NOT EXISTS 'inquiry_follow_up';--> statement-breakpoint
ALTER TYPE "public"."app_event" ADD VALUE IF NOT EXISTS 'inquiry_converted';--> statement-breakpoint
ALTER TYPE "public"."app_event" ADD VALUE IF NOT EXISTS 'ticket_created';--> statement-breakpoint
ALTER TYPE "public"."app_event" ADD VALUE IF NOT EXISTS 'ticket_reply';--> statement-breakpoint
ALTER TYPE "public"."app_event" ADD VALUE IF NOT EXISTS 'ticket_resolved';--> statement-breakpoint
ALTER TYPE "public"."app_event" ADD VALUE IF NOT EXISTS 'signup';--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "event" TYPE "public"."app_event" USING "event"::text::"public"."app_event";--> statement-breakpoint
ALTER TABLE "notification_outbox" ALTER COLUMN "event" TYPE "public"."app_event" USING "event"::text::"public"."app_event";--> statement-breakpoint
DROP TYPE "public"."notification_event";
