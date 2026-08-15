CREATE TYPE "public"."app_event" AS ENUM('order_placed', 'order_paid', 'order_fulfilled', 'order_cancelled', 'payment_failed', 'refund_issued', 'catering_inquiry', 'contact_message', 'signup');--> statement-breakpoint
CREATE TYPE "public"."message_kind" AS ENUM('transactional', 'marketing');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('email', 'in_app', 'sms', 'whatsapp');--> statement-breakpoint
CREATE TYPE "public"."notification_outbox_status" AS ENUM('pending', 'processing', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."suppression_scope" AS ENUM('all', 'marketing');--> statement-breakpoint
CREATE TYPE "public"."email_status" AS ENUM('sent', 'failed');--> statement-breakpoint
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
CREATE TABLE "notification_outbox" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"recipient_id" bigint,
	"recipient_email" text,
	"recipient_phone" text,
	"channel" "notification_channel" NOT NULL,
	"kind" "message_kind" DEFAULT 'transactional' NOT NULL,
	"event" "app_event",
	"campaign_id" bigint,
	"payload" jsonb NOT NULL,
	"status" "notification_outbox_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" bigint NOT NULL,
	"last_error" text,
	"provider_message_id" text,
	"dedupe_key" text,
	CONSTRAINT "notification_outbox_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "notification_prefs" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"user_id" bigint NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"kind" "message_kind" DEFAULT 'transactional' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"consent_source" text,
	"consent_at" bigint,
	CONSTRAINT "notification_prefs_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "notification_template" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"event" "app_event" NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"locale" "locale" NOT NULL,
	"subject" text NOT NULL,
	"body" text,
	"html" text,
	"text" text,
	"provider_template_id" text,
	"enabled" boolean DEFAULT true NOT NULL,
	CONSTRAINT "notification_template_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"user_id" bigint NOT NULL,
	"event" "app_event",
	"title" text NOT NULL,
	"body" text NOT NULL,
	"href" text,
	"read_at" bigint,
	CONSTRAINT "notifications_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "email_log" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"recipient" text NOT NULL,
	"subject" text NOT NULL,
	"status" "email_status" NOT NULL,
	"provider_message_id" text,
	"error" text,
	CONSTRAINT "email_log_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_prefs" ADD CONSTRAINT "notification_prefs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "message_suppression_address_channel_scope_idx" ON "message_suppression" USING btree ("address","channel","scope");--> statement-breakpoint
CREATE INDEX "notification_outbox_due_idx" ON "notification_outbox" USING btree ("kind","status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "notification_outbox_campaign_idx" ON "notification_outbox" USING btree ("campaign_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_outbox_dedupe_idx" ON "notification_outbox" USING btree ("dedupe_key");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_prefs_user_channel_kind_idx" ON "notification_prefs" USING btree ("user_id","channel","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_template_key_idx" ON "notification_template" USING btree ("event","channel","locale");--> statement-breakpoint
CREATE INDEX "notifications_user_created_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "email_log_created_idx" ON "email_log" USING btree ("created_at");