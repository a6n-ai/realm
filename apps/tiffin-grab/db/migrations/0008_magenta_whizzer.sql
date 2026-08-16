ALTER TABLE "orders" ADD COLUMN "default_swaps" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "category_swap_rules" ADD COLUMN "to_weight_value" numeric(6, 2);--> statement-breakpoint
ALTER TABLE "category_swap_rules" ADD COLUMN "to_weight_unit" "weight_unit";--> statement-breakpoint
ALTER TABLE "delivery_category_swaps" ADD COLUMN "to_weight_value" numeric(6, 2);--> statement-breakpoint
ALTER TABLE "delivery_category_swaps" ADD COLUMN "to_weight_unit" "weight_unit";