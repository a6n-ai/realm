-- category_swap_pairs.plan_id becomes nullable: null = the rule applies on
-- every plan (the default when an admin doesn't pick one), a specific plan
-- restricts it to just that plan. A partial unique index enforces at most one
-- null-plan ("all plans") row per (from, to) pair — the regular unique index
-- on (from, to, plan_id) does not, since Postgres treats NULL as distinct.
ALTER TABLE "category_swap_pairs" ALTER COLUMN "plan_id" DROP NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "category_swap_pairs_pair_null_plan_unique" ON "category_swap_pairs" USING btree ("from_category_id","to_category_id") WHERE "plan_id" IS NULL;
