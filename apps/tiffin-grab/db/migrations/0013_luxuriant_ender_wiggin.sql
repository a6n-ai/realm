ALTER TABLE "campaign" ADD COLUMN "system_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_system_key_idx" ON "campaign" USING btree ("system_key");