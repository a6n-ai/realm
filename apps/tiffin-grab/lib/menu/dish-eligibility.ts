import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { dishes, mealSizeItems } from "@/db/schema";

/**
 * The dish ids on a plan. Single source of truth for "what may this plan be
 * served", shared by setSelection (input validation), buildMealsGrid (option
 * filtering) and resolveDeliveryMeal (per-category filtering) so the three
 * can never disagree.
 */
export async function dishIdsForPlan(planId: bigint): Promise<Set<bigint>> {
  const rows = await db.select({ id: dishes.id }).from(dishes).where(eq(dishes.planId, planId));
  return new Set(rows.map((r) => r.id));
}

/**
 * A dish belongs to exactly one plan now, so "exclusive to this plan" is every
 * dish on it — same set as dishIdsForPlan. Kept as a separate export (rather
 * than inlining dishIdsForPlan at each call site) because callers name it for
 * the "exclusive_to_plan" meal-rule concept, not because the sets can differ.
 */
export const exclusiveDishIdsForPlan = dishIdsForPlan;

/**
 * The dish ids a subscriber on this MEAL SIZE may ever be served — the union of
 * dishIdsForPlan(planId) over every distinct plan the meal size's own
 * composition rows target, not just the order's own plan.
 *
 * This is what makes "add a second Sabzi row, tagged veg" on a non-veg meal
 * size actually reach the subscriber: a meal size can mix categories across
 * plans (e.g. non-veg thali with both a veg-tagged and a non-veg-tagged sabzi
 * slot), so the food-safety filter has to be keyed off the meal size's item
 * rows, not the order's single planId. A meal size whose items are all on one
 * plan (the common case) reduces to exactly dishIdsForPlan(that plan) — same
 * behavior as before this existed.
 */
export async function allowedDishIdsForMealSize(mealSizeId: bigint): Promise<Set<bigint>> {
  const rows = await db.selectDistinct({ planId: mealSizeItems.planId }).from(mealSizeItems).where(eq(mealSizeItems.mealSizeId, mealSizeId));
  const sets = await Promise.all(rows.map((r) => dishIdsForPlan(r.planId)));
  const out = new Set<bigint>();
  for (const s of sets) for (const id of s) out.add(id);
  return out;
}
