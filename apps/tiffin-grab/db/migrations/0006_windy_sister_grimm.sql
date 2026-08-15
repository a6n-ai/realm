CREATE TYPE "public"."message_kind" AS ENUM('transactional', 'marketing');--> statement-breakpoint
CREATE TYPE "public"."suppression_scope" AS ENUM('all', 'marketing');--> statement-breakpoint
CREATE TABLE "message_suppression" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"address" text NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"scope" "suppression_scope" DEFAULT 'all' NOT NULL,
	"reason" text NOT NULL,
	CONSTRAINT "message_suppression_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
DROP INDEX "notification_prefs_user_channel_idx";--> statement-breakpoint
DROP INDEX "notification_outbox_due_idx";--> statement-breakpoint
ALTER TABLE "notification_outbox" ALTER COLUMN "recipient_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_outbox" ALTER COLUMN "event" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "event" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD COLUMN "recipient_email" text;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD COLUMN "recipient_phone" text;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD COLUMN "kind" "message_kind" DEFAULT 'transactional' NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD COLUMN "campaign_id" bigint;--> statement-breakpoint
ALTER TABLE "notification_prefs" ADD COLUMN "kind" "message_kind" DEFAULT 'transactional' NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_prefs" ADD COLUMN "consent_source" text;--> statement-breakpoint
ALTER TABLE "notification_prefs" ADD COLUMN "consent_at" bigint;--> statement-breakpoint
ALTER TABLE "notification_template" ADD COLUMN "provider_template_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "message_suppression_address_channel_scope_idx" ON "message_suppression" USING btree ("address","channel","scope");--> statement-breakpoint
CREATE INDEX "notification_outbox_campaign_idx" ON "notification_outbox" USING btree ("campaign_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_prefs_user_channel_kind_idx" ON "notification_prefs" USING btree ("user_id","channel","kind");--> statement-breakpoint
CREATE INDEX "notification_outbox_due_idx" ON "notification_outbox" USING btree ("kind","status","next_attempt_at");--> statement-breakpoint
-- public_id and created_at are drizzle $defaultFn values (application-side),
-- NOT DB defaults, so they must be generated here — a plain column list
-- violates their NOT NULL constraints the moment this SELECT matches a row.
INSERT INTO "message_suppression" ("public_id", "created_at", "address", "channel", "scope", "reason")
SELECT 'msp_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
       (extract(epoch from now()) * 1000)::bigint,
       lower(u."email"), p."channel", 'all', COALESCE(p."suppressed_reason", 'migrated')
FROM "notification_prefs" p
JOIN "users" u ON u."id" = p."user_id"
WHERE p."suppressed" = true AND u."email" IS NOT NULL
ON CONFLICT ("address", "channel", "scope") DO NOTHING;--> statement-breakpoint
ALTER TABLE "notification_prefs" DROP COLUMN "suppressed";--> statement-breakpoint
ALTER TABLE "notification_prefs" DROP COLUMN "suppressed_reason";