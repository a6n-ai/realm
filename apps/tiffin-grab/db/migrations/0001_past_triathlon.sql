CREATE TABLE "category_swap_pairs" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"from_category_id" bigint NOT NULL,
	"to_category_id" bigint NOT NULL,
	CONSTRAINT "category_swap_pairs_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
ALTER TABLE "category_swap_rules" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "category_swap_rules" CASCADE;--> statement-breakpoint
DROP INDEX "delivery_category_swaps_delivery_rule_unique";--> statement-breakpoint
ALTER TABLE "category_swap_pairs" ADD CONSTRAINT "category_swap_pairs_from_category_id_dish_categories_id_fk" FOREIGN KEY ("from_category_id") REFERENCES "public"."dish_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_swap_pairs" ADD CONSTRAINT "category_swap_pairs_to_category_id_dish_categories_id_fk" FOREIGN KEY ("to_category_id") REFERENCES "public"."dish_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "category_swap_pairs_pair_unique" ON "category_swap_pairs" USING btree ("from_category_id","to_category_id");--> statement-breakpoint
ALTER TABLE "meal_size_items" DROP COLUMN "qty";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "default_swaps";--> statement-breakpoint
ALTER TABLE "delivery_category_swaps" DROP COLUMN "rule_id";