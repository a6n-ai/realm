import { eq, inArray } from "drizzle-orm";
import { db } from "./client";
import { categoryPlans, dishCategories, dishes, plans } from "./schema";

/**
 * The veg plan's id, for fixtures that need SOME valid dishes.planId and don't
 * care which one. dishes.planId is NOT NULL, so every `db.insert(dishes)` in a
 * test needs a real plan id now — this is that default.
 */
export async function testPlanId(key: string = "veg"): Promise<bigint> {
  const [row] = await db.select({ id: plans.id }).from(plans).where(eq(plans.key, key)).limit(1);
  if (!row) throw new Error(`testPlanId: no plan with key "${key}" — is the catalog seeded?`);
  return row.id;
}

/**
 * Set a fixture dish's single plan. A dish belongs to exactly one plan now,
 * so this just updates dishes.planId — the same write production admin makes.
 * Pass exactly one key (defaults to "veg" — most fixtures don't care which
 * plan, they just need one that exists).
 */
export async function attachDishToPlans(dishId: bigint, planKeys: string[] = ["veg"]): Promise<void> {
  if (planKeys.length !== 1) throw new Error("attachDishToPlans: a dish belongs to exactly one plan now — pass one key");
  const [row] = await db.select({ id: plans.id }).from(plans).where(eq(plans.key, planKeys[0])).limit(1);
  if (!row) throw new Error(`attachDishToPlans: no plan with key "${planKeys[0]}" — is the catalog seeded?`);
  await db.update(dishes).set({ planId: row.id }).where(eq(dishes.id, dishId));
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

/**
 * Category row id for a key. menu_items and meal_selections hold a foreign key now, so a
 * fixture that used to write `slot: "sabzi"` writes `categoryId: await categoryIdFor("sabzi")`.
 * Throws rather than returning undefined — a typo'd key used to insert silently and produce
 * a row nothing could ever resolve, which is the drift the foreign key exists to stop.
 */
export async function categoryIdFor(key: string): Promise<bigint> {
  const [row] = await db.select({ id: dishCategories.id }).from(dishCategories).where(eq(dishCategories.key, key)).limit(1);
  if (!row) throw new Error(`categoryIdFor: no dish_categories row with key "${key}" — is the catalog seeded?`);
  return row.id;
}
