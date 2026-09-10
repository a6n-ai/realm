ALTER TABLE "campaign_content" ADD COLUMN "attachments" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "catering_inquiries" ADD COLUMN "region" text;