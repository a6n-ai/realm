// Admin CRUD for category_swap_rules — which categories a meal size's composition
// may be swapped between, and at what quantities. Mirrors the validate-then-write
// shape MealSizeService uses for meal_size_items (catalog.service.ts): every
// category soft-ref is checked against dishCategoriesService.forPlan(mealSize.planId)
// (not the global category list) before it reaches the table, so a rule can never
// point at a category the meal size's own plan doesn't serve.
import { ValidationError } from "@realm/commons";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { categorySwapRules, mealSizes } from "@/db/schema";
import { dishCategoriesService } from "./dish-categories.service";

export type CreateSwapRuleInput = {
  mealSizeId: bigint;
  fromCategory: string;
  toCategory: string;
  qtyFrom: number;
  qtyTo: number;
  toWeightValue?: number | null;
  toWeightUnit?: "oz" | "g" | "ml" | "piece" | null;
};

export async function createSwapRule(input: CreateSwapRuleInput) {
  if (input.fromCategory === input.toCategory) {
    throw new ValidationError("A swap must be between two different categories");
  }
  if (input.qtyFrom <= 0 || input.qtyTo <= 0) {
    throw new ValidationError("Quantities must be positive");
  }

  const hasValue = input.toWeightValue != null;
  const hasUnit = input.toWeightUnit != null;
  // Half a portion is worse than none: it would render as a bare number on a
  // kitchen label with no idea whether it means grams or pieces.
  if (hasValue !== hasUnit) throw new ValidationError("A portion needs both an amount and a unit");
  if (hasValue && !(input.toWeightValue! > 0)) throw new ValidationError("Portion must be positive");

  // Validate against the meal size's OWN plan, not the global category list: a
  // rule whose toCategory has no slot on this plan would still pass a global
  // check, then silently delete food at delivery time (applySwapsToCounts
  // debits fromCategory before resolve-delivery-meal finds no items to give back).
  const [size] = await db.select({ planId: mealSizes.planId }).from(mealSizes).where(eq(mealSizes.id, input.mealSizeId)).limit(1);
  if (!size) throw new ValidationError("Meal size not found");

  const categories = await dishCategoriesService.forPlan(size.planId);
  const keys = new Set(categories.map((c) => c.key));
  if (!keys.has(input.fromCategory)) throw new ValidationError(`Category "${input.fromCategory}" is not on this meal size's plan`);
  if (!keys.has(input.toCategory)) throw new ValidationError(`Category "${input.toCategory}" is not on this meal size's plan`);

  try {
    const [created] = await db.insert(categorySwapRules).values({
      mealSizeId: input.mealSizeId,
      fromCategory: input.fromCategory,
      toCategory: input.toCategory,
      qtyFrom: input.qtyFrom,
      qtyTo: input.qtyTo,
      toWeightValue: input.toWeightValue == null ? null : input.toWeightValue.toFixed(2),
      toWeightUnit: input.toWeightUnit ?? null,
    }).returning();
    return created;
  } catch (e) {
    // Unique index (mealSizeId, fromCategory, toCategory) — surface a friendly message
    // instead of a raw constraint error.
    if (e instanceof Error && e.message.includes("category_swap_rules_direction_unique")) {
      throw new ValidationError("A rule for this direction already exists — remove it first to change the quantities");
    }
    throw e;
  }
}

export async function removeSwapRule(id: bigint): Promise<void> {
  const deleted = await db.delete(categorySwapRules).where(eq(categorySwapRules.id, id)).returning({ id: categorySwapRules.id });
  if (deleted.length === 0) throw new ValidationError("Swap rule not found");
}
