DROP INDEX "inquiries_phone_lower_idx";--> statement-breakpoint
DROP INDEX "inquiries_email_lower_idx";--> statement-breakpoint
DROP INDEX "inquiries_whatsapp_lower_idx";--> statement-breakpoint
DROP INDEX "inquiries_open_phone_unique";--> statement-breakpoint
DROP INDEX "inquiries_open_email_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "inquiries_phone_unique" ON "inquiries" USING btree (lower("phone")) WHERE "inquiries"."phone" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "inquiries_email_unique" ON "inquiries" USING btree (lower("email")) WHERE "inquiries"."email" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "inquiries_whatsapp_unique" ON "inquiries" USING btree (lower("whatsapp_phone")) WHERE "inquiries"."whatsapp_phone" is not null;