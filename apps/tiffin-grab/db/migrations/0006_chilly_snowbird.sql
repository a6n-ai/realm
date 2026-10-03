ALTER TYPE "public"."inquiry_activity_type" ADD VALUE 'reinquiry';--> statement-breakpoint
DROP INDEX "inquiries_open_phone_source_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "inquiries_open_phone_unique" ON "inquiries" USING btree (lower("phone")) WHERE "inquiries"."stage" not in ('converted', 'lost');--> statement-breakpoint
CREATE UNIQUE INDEX "inquiries_open_email_unique" ON "inquiries" USING btree (lower("email")) WHERE "inquiries"."stage" not in ('converted', 'lost');