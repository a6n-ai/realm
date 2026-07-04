ALTER TABLE "users" ADD COLUMN "address_line" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "address_unit" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "city" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "postal_code" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "province" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "dietary_notes" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "allergens" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "delivery_notes" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "notify_email" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "notify_sms" boolean DEFAULT false NOT NULL;