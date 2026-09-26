-- Per swap pair: given portion -> received portion, in TU. Empty = natural exchange.
ALTER TABLE "category_swap_pairs" ADD COLUMN "exchange_overrides" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
-- TU per received pick, snapshotted at apply. NULL = natural exchange (every existing row).
ALTER TABLE "delivery_category_swaps" ADD COLUMN "receive_tu" numeric(6, 2);
