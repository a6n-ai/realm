import { eq, inArray } from "drizzle-orm";
import { db } from "./client";
import { categoryPlans, dishCategories, dishPlans, plans } from "./schema";

/**
 * Attach a fixture dish to plans. Dishes reach a menu only through dish_plans
 * now, so a test that inserts a dish and expects it on a menu must attach it —
 * the same rule production data follows.
 *
 * Defaults to every plan, which matches how most fixtures behaved when `diet`
 * existed and nothing filtered them. Pass explicit keys to test the filtering
 * itself (e.g. ["non-veg"] for a dish a vegetarian must never be offered).
 */
export async function attachDishToPlans(dishId: bigint, planKeys?: string[]): Promise<void> {
  const rows = planKeys?.length
    ? await db.select({ id: plans.id }).from(plans).where(inArray(plans.key, planKeys))
    : await db.select({ id: plans.id }).from(plans);
  if (rows.length === 0) throw new Error("attachDishToPlans: no plans found — is the catalog seeded?");
  await db.delete(dishPlans).where(eq(dishPlans.dishId, dishId));
  await db.insert(dishPlans).values(rows.map((p) => ({ dishId, planId: p.id })));
}

/**
 * Same for menu slots. A test that replaces dish_categories with its own rows
 * must attach them to plans, or every membership-based lookup returns nothing
 * and the slot reads as "Unknown category".
 */
export async function attachCategoryToPlans(categoryId: bigint, planKeys?: string[]): Promise<void> {
  const rows = planKeys?.length
    ? await db.select({ id: plans.id }).from(plans).where(inArray(plans.key, planKeys))
    : await db.select({ id: plans.id }).from(plans);
  if (rows.length === 0) throw new Error("attachCategoryToPlans: no plans found — is the catalog seeded?");
  await db.delete(categoryPlans).where(eq(categoryPlans.categoryId, categoryId));
  await db.insert(categoryPlans).values(rows.map((p) => ({ categoryId, planId: p.id })));
}

/** Attach every existing dish_categories row to every plan. */
export async function attachAllCategoriesToPlans(): Promise<void> {
  const cats = await db.select({ id: dishCategories.id }).from(dishCategories);
  for (const c of cats) await attachCategoryToPlans(c.id);
}
