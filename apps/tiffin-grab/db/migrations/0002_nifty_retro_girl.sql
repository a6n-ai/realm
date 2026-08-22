CREATE TYPE "public"."campaign_status" AS ENUM('draft', 'scheduled', 'sending', 'sent', 'paused', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."consent_source" AS ENUM('purchase', 'express_optin', 'event_signup', 'import_other');--> statement-breakpoint
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
ALTER TABLE "campaign_content" ADD CONSTRAINT "campaign_content_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_list_member" ADD CONSTRAINT "contact_list_member_list_id_contact_list_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."contact_list"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaign_status_scheduled_idx" ON "campaign" USING btree ("status","scheduled_at");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_content_key_idx" ON "campaign_content" USING btree ("campaign_id","channel","locale");--> statement-breakpoint
CREATE UNIQUE INDEX "contact_list_member_email_idx" ON "contact_list_member" USING btree ("list_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "contact_list_member_phone_idx" ON "contact_list_member" USING btree ("list_id","phone");--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE no action ON UPDATE no action;