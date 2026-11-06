ALTER TABLE "app" ADD COLUMN "tracked_email_events" jsonb;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD COLUMN "clicked_at" bigint;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD COLUMN "bounced_at" bigint;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD COLUMN "complained_at" bigint;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD COLUMN "delayed_at" bigint;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD COLUMN "rejected_at" bigint;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD COLUMN "render_failed_at" bigint;