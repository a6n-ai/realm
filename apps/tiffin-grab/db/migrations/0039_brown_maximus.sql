DROP INDEX "category_swap_pairs_pair_unique";--> statement-breakpoint
DROP INDEX "category_swap_pairs_pair_null_plan_unique";--> statement-breakpoint
ALTER TABLE "category_swap_pairs" ADD COLUMN "receives_missing" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "category_swap_pairs" ADD COLUMN "meal_size_id" bigint;--> statement-breakpoint
ALTER TABLE "category_swap_pairs" ADD CONSTRAINT "category_swap_pairs_meal_size_id_meal_sizes_id_fk" FOREIGN KEY ("meal_size_id") REFERENCES "public"."meal_sizes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "category_swap_pairs_pair_meal_size_unique" ON "category_swap_pairs" USING btree ("from_category_id","to_category_id","meal_size_id") WHERE "category_swap_pairs"."meal_size_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "category_swap_pairs_meal_size_idx" ON "category_swap_pairs" USING btree ("meal_size_id");--> statement-breakpoint
CREATE UNIQUE INDEX "category_swap_pairs_pair_unique" ON "category_swap_pairs" USING btree ("from_category_id","to_category_id","plan_id") WHERE "category_swap_pairs"."meal_size_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "category_swap_pairs_pair_null_plan_unique" ON "category_swap_pairs" USING btree ("from_category_id","to_category_id") WHERE "category_swap_pairs"."plan_id" IS NULL AND "category_swap_pairs"."meal_size_id" IS NULL;