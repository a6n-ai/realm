// Admin CRUD for category_swap_rules — which categories a meal size's composition
// may be swapped between, and at what quantities. Mirrors the validate-then-write
// shape MealSizeService uses for meal_size_items (catalog.service.ts): every
// category soft-ref is checked against dishCategoriesService.enabledCategories()
// before it reaches the table.
import { ValidationError } from "@realm/commons";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { categorySwapRules } from "@/db/schema";
import { dishCategoriesService } from "./dish-categories.service";

export type CreateSwapRuleInput = {
  mealSizeId: bigint;
  fromCategory: string;
  toCategory: string;
  qtyFrom: number;
  qtyTo: number;
};

export async function createSwapRule(input: CreateSwapRuleInput) {
  if (input.fromCategory === input.toCategory) {
    throw new ValidationError("A swap must be between two different categories");
  }
  if (input.qtyFrom <= 0 || input.qtyTo <= 0) {
    throw new ValidationError("Quantities must be positive");
  }

  const categories = await dishCategoriesService.enabledCategories();
  const keys = new Set(categories.map((c) => c.key));
  if (!keys.has(input.fromCategory)) throw new ValidationError(`Unknown category: ${input.fromCategory}`);
  if (!keys.has(input.toCategory)) throw new ValidationError(`Unknown category: ${input.toCategory}`);

  try {
    const [created] = await db.insert(categorySwapRules).values(input).returning();
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
