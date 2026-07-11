-- M8: meal_size_items.category is NOT NULL with no default, so this ADD COLUMN
-- fails on any DB that already holds meal_size_items rows. This delta therefore
-- requires a rebuild-from-empty: migrate runs before seed on a fresh DB, and the
-- seed DELETEs+reinserts meal_size_items. Safe here — pre-launch, no seeded orders.
ALTER TABLE "dishes" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "meal_size_items" ADD COLUMN "category" text NOT NULL;--> statement-breakpoint
ALTER TABLE "meal_size_items" ADD COLUMN "label" text;--> statement-breakpoint
ALTER TABLE "meal_sizes" ADD COLUMN "plan_type" "plan_type" DEFAULT 'tiffin' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "category_counts" jsonb DEFAULT '{}'::jsonb NOT NULL;