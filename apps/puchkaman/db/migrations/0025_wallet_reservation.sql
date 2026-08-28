ALTER TABLE "wallet_ledger" ADD COLUMN "reserved_until" bigint;--> statement-breakpoint
CREATE INDEX "wallet_reserved_until_idx" ON "wallet_ledger" USING btree ("reserved_until");