CREATE TYPE "public"."section_kind" AS ENUM('tickets', 'inquiries', 'customers');--> statement-breakpoint
CREATE TABLE "section_seen" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"user_id" bigint NOT NULL,
	"section" "section_kind" NOT NULL,
	"seen_at" bigint NOT NULL,
	CONSTRAINT "section_seen_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
ALTER TABLE "ticket_messages" ADD COLUMN "attachments" jsonb;--> statement-breakpoint
ALTER TABLE "section_seen" ADD CONSTRAINT "section_seen_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "section_seen_user_section_idx" ON "section_seen" USING btree ("user_id","section");