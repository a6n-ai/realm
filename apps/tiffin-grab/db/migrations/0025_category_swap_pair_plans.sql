CREATE TABLE "category_swap_pair_plans" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"swap_pair_id" bigint NOT NULL,
	"plan_id" bigint NOT NULL,
	CONSTRAINT "category_swap_pair_plans_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
ALTER TABLE "category_swap_pair_plans" ADD CONSTRAINT "category_swap_pair_plans_swap_pair_id_category_swap_pairs_id_fk" FOREIGN KEY ("swap_pair_id") REFERENCES "public"."category_swap_pairs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_swap_pair_plans" ADD CONSTRAINT "category_swap_pair_plans_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "category_swap_pair_plans_unique" ON "category_swap_pair_plans" USING btree ("swap_pair_id","plan_id");
