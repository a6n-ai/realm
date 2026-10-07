ALTER TABLE "tickets" ADD COLUMN "rating" integer;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "rating_note" text;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "rated_at" bigint;--> statement-breakpoint
CREATE INDEX "wallet_order_idx" ON "wallet_ledger" USING btree ("order_id");--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_rating_range" CHECK ("tickets"."rating" is null or "tickets"."rating" between 1 and 5);