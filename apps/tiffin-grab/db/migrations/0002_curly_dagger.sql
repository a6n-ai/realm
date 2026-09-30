ALTER TYPE "public"."app_event" ADD VALUE IF NOT EXISTS 'payment_reminder';--> statement-breakpoint
ALTER TYPE "public"."app_event" ADD VALUE IF NOT EXISTS 'payment_approved';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_outbox_recipient_idx" ON "notification_outbox" USING btree ("recipient_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_outbox_pending_idx" ON "notification_outbox" USING btree ("next_attempt_at") WHERE "notification_outbox"."status" = 'pending';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_outbox_provider_message_idx" ON "notification_outbox" USING btree ("provider_message_id") WHERE "notification_outbox"."provider_message_id" is not null;