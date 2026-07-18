CREATE TYPE "public"."email_status" AS ENUM('sent', 'failed');--> statement-breakpoint
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
CREATE INDEX "email_log_created_idx" ON "email_log" USING btree ("created_at");