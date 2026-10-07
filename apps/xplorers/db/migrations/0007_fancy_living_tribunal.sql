CREATE TYPE "public"."campaign_status" AS ENUM('draft', 'scheduled', 'sending', 'sent', 'completed', 'paused', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."consent_source" AS ENUM('purchase', 'express_optin', 'event_signup', 'import_other');--> statement-breakpoint
CREATE TYPE "public"."message_kind" AS ENUM('transactional', 'marketing');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('email', 'in_app', 'sms', 'whatsapp');--> statement-breakpoint
CREATE TYPE "public"."notification_outbox_status" AS ENUM('pending', 'processing', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."suppression_scope" AS ENUM('all', 'marketing');--> statement-breakpoint
ALTER TYPE "public"."app_event" ADD VALUE 'wallet_credited';--> statement-breakpoint
ALTER TYPE "public"."app_event" ADD VALUE 'ticket_created';--> statement-breakpoint
ALTER TYPE "public"."app_event" ADD VALUE 'ticket_reply';--> statement-breakpoint
ALTER TYPE "public"."app_event" ADD VALUE 'ticket_resolved';--> statement-breakpoint
ALTER TYPE "public"."app_event" ADD VALUE 'friend_request';--> statement-breakpoint
ALTER TYPE "public"."app_event" ADD VALUE 'friend_accepted';--> statement-breakpoint
ALTER TYPE "public"."app_event" ADD VALUE 'staff_invitation';--> statement-breakpoint
CREATE TABLE "campaign" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"name" text NOT NULL,
	"channels" "notification_channel"[] NOT NULL,
	"audience" jsonb NOT NULL,
	"status" "campaign_status" DEFAULT 'draft' NOT NULL,
	"scheduled_at" bigint,
	"sent_at" bigint,
	"counts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"system_key" text,
	CONSTRAINT "campaign_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "campaign_content" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"campaign_id" bigint NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"locale" "locale" NOT NULL,
	"subject" text NOT NULL,
	"body" text,
	"html" text,
	"text" text,
	"provider_template_id" text,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "campaign_content_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "contact_list" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"name" text NOT NULL,
	"consent_source" "consent_source" NOT NULL,
	"consent_at" bigint NOT NULL,
	"consent_note" text,
	"member_count" integer DEFAULT 0 NOT NULL,
	"segment_def" jsonb,
	CONSTRAINT "contact_list_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "contact_list_member" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"list_id" bigint NOT NULL,
	"email" text,
	"phone" text,
	"name" text,
	"vars" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"unsubscribed_at" bigint,
	CONSTRAINT "contact_list_member_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
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
	"campaign_id" bigint,
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
	"delivered_at" bigint,
	"opened_at" bigint,
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
CREATE TABLE "phone_verification" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"phone" text NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" bigint NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"consumed_at" bigint,
	CONSTRAINT "phone_verification_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
ALTER TABLE "campaign_content" ADD CONSTRAINT "campaign_content_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_list_member" ADD CONSTRAINT "contact_list_member_list_id_contact_list_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."contact_list"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_prefs" ADD CONSTRAINT "notification_prefs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaign_status_scheduled_idx" ON "campaign" USING btree ("status","scheduled_at");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_system_key_idx" ON "campaign" USING btree ("system_key");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_content_key_idx" ON "campaign_content" USING btree ("campaign_id","channel","locale");--> statement-breakpoint
CREATE UNIQUE INDEX "contact_list_member_email_idx" ON "contact_list_member" USING btree ("list_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "contact_list_member_phone_idx" ON "contact_list_member" USING btree ("list_id","phone");--> statement-breakpoint
CREATE UNIQUE INDEX "message_suppression_address_channel_scope_idx" ON "message_suppression" USING btree ("address","channel","scope");--> statement-breakpoint
CREATE INDEX "notification_outbox_due_idx" ON "notification_outbox" USING btree ("kind","status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "notification_outbox_campaign_idx" ON "notification_outbox" USING btree ("campaign_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_outbox_dedupe_idx" ON "notification_outbox" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "notification_outbox_recipient_idx" ON "notification_outbox" USING btree ("recipient_id");--> statement-breakpoint
CREATE INDEX "notification_outbox_pending_idx" ON "notification_outbox" USING btree ("next_attempt_at") WHERE "notification_outbox"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "notification_outbox_provider_message_idx" ON "notification_outbox" USING btree ("provider_message_id") WHERE "notification_outbox"."provider_message_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_prefs_user_channel_kind_idx" ON "notification_prefs" USING btree ("user_id","channel","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_template_key_idx" ON "notification_template" USING btree ("event","channel","locale");--> statement-breakpoint
CREATE INDEX "notifications_user_created_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "phone_verification_phone_idx" ON "phone_verification" USING btree ("phone","expires_at");