import { dishes, plans } from "@/db/schema";
import { db } from "@/db/client";
import { inArray } from "drizzle-orm";
import { mealRulesService } from "@/lib/services/meal-rules.service";
import { dishCategoriesService } from "@/lib/services/dish-categories.service";
import { ruleText, type RuleLabels } from "./meal-rule-text";

/**
 * The rules that apply to an order, as customer-facing sentences.
 *
 * Scope-filtered only — deliberately NOT evaluated per dish option. Greying out
 * individual dishes would be combinatorial once several rules overlap, and would
 * leave a customer facing disabled dishes with no explanation; a short list of
 * sentences says the same thing in words and costs nothing per extra rule.
 */
export async function listRuleTextsForOrder(
  planId: bigint,
  mealSizeId: bigint | null,
): Promise<{ publicId: string; text: string }[]> {
  const rules = await mealRulesService.listEnabledForOrder({ planId, mealSizeId });
  if (rules.length === 0) return [];

  // Only look up names for rules that still need a sentence generated.
  const needsLabels = rules.some((r) => !r.description?.trim());
  let labels: RuleLabels = { category: {}, plan: {}, dish: {} };
  if (needsLabels) {
    const planIds = new Set<string>();
    const dishIds = new Set<string>();
    for (const r of rules) {
      for (const c of r.conditions) {
        for (const id of c.valueIds ?? []) (c.field === "dish_plan" ? planIds : dishIds).add(id.toString());
      }
    }
    const [cats, planRows, dishRows] = await Promise.all([
      dishCategoriesService.enabledCategories(),
      planIds.size
        ? db.select({ id: plans.id, name: plans.name }).from(plans).where(inArray(plans.id, [...planIds].map(BigInt)))
        : Promise.resolve([]),
      dishIds.size
        ? db.select({ id: dishes.id, name: dishes.name }).from(dishes).where(inArray(dishes.id, [...dishIds].map(BigInt)))
        : Promise.resolve([]),
    ]);
    labels = {
      category: Object.fromEntries(cats.map((c) => [c.key, c.label])),
      plan: Object.fromEntries(planRows.map((r) => [r.id.toString(), r.name])),
      dish: Object.fromEntries(dishRows.map((r) => [r.id.toString(), r.name])),
    };
  }

  return rules.map((r) => ({ publicId: r.publicId, text: ruleText(r, labels) }));
}
