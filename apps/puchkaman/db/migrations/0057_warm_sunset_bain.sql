ALTER TABLE "notification_outbox" ADD COLUMN "delivered_at" bigint;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD COLUMN "opened_at" bigint;