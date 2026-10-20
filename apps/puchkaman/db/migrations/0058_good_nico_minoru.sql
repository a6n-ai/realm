ALTER TABLE "campaign_content" ADD COLUMN "revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_template" ADD COLUMN "revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "wallet_order_idx" ON "wallet_ledger" USING btree ("order_id");