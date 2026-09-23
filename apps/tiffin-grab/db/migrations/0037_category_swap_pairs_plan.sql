-- category_swap_pairs becomes plan-scoped: a swap rule now applies to exactly
-- one plan (mirrors dishes.planId / meal_size_items.planId), not globally.
-- Existing pairs are backfilled into one row per plan that has BOTH categories
-- attached (category_plans intersection) — the same set of plans the old
-- indirect dish-existence check would have allowed anyway.
ALTER TABLE "category_swap_pairs" ADD COLUMN "plan_id" bigint;--> statement-breakpoint
-- Old (from,to)-only unique index must go before backfill inserts a second row
-- per pair (one per plan) — otherwise the second plan's row collides with it.
DROP INDEX "category_swap_pairs_pair_unique";--> statement-breakpoint
INSERT INTO "category_swap_pairs" (public_id, created_at, updated_at, from_category_id, to_category_id, plan_id, organization_id)
SELECT 'csp_' || SUBSTR(MD5(csp.id::text || cp_from.plan_id::text), 1, 10),
       (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
       (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
       csp.from_category_id,
       csp.to_category_id,
       cp_from.plan_id,
       csp.organization_id
FROM "category_swap_pairs" csp
JOIN "category_plans" cp_from ON cp_from.category_id = csp.from_category_id
JOIN "category_plans" cp_to ON cp_to.category_id = csp.to_category_id AND cp_to.plan_id = cp_from.plan_id
WHERE csp.plan_id IS NULL;--> statement-breakpoint
DELETE FROM "category_swap_pairs" WHERE "plan_id" IS NULL;--> statement-breakpoint
ALTER TABLE "category_swap_pairs" ALTER COLUMN "plan_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "category_swap_pairs" ADD CONSTRAINT "category_swap_pairs_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE CASCADE ON UPDATE NO ACTION;--> statement-breakpoint
CREATE UNIQUE INDEX "category_swap_pairs_pair_unique" ON "category_swap_pairs" USING btree ("from_category_id","to_category_id","plan_id");
