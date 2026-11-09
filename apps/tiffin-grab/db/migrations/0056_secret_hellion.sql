CREATE TABLE "lead_counters" (
	"org_key" text PRIMARY KEY NOT NULL,
	"last_number" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inquiries" ADD COLUMN "whatsapp_phone" text;--> statement-breakpoint
ALTER TABLE "inquiries" ADD COLUMN "lead_number" integer;--> statement-breakpoint
CREATE INDEX "inquiries_whatsapp_lower_idx" ON "inquiries" USING btree (lower("whatsapp_phone"));--> statement-breakpoint
CREATE UNIQUE INDEX "inquiries_org_lead_number_unique" ON "inquiries" USING btree (coalesce("organization_id", ''),"lead_number") WHERE "inquiries"."lead_number" is not null;