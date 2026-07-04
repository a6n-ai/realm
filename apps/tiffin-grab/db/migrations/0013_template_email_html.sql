ALTER TABLE "notification_template" ALTER COLUMN "body" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_template" ADD COLUMN "html" text;--> statement-breakpoint
ALTER TABLE "notification_template" ADD COLUMN "text" text;