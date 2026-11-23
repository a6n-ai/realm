import { db } from "@/db/client";
import { categoryPlans, dishCategories, plans } from "@/db/schema";
import { configCache } from "@/lib/cache";

export type DishCategoryRow = typeof dishCategories.$inferSelect;
export type CategoryRef = {
  categories: DishCategoryRow[];
  memberships: { categoryId: bigint; planId: bigint }[];
  plans: { id: bigint; planType: string }[];
};

// Dish categories, plan membership and plan types are read on every menu, swap and catalog render.
// One value holds all three small tables; every category, membership or plan write evicts it.
const refCache = configCache("dish-category-ref");

export async function invalidateDishCategories(): Promise<void> {
  await refCache.evictAll();
}

async function loadRef(): Promise<CategoryRef> {
  const [categories, memberships, planRows] = await Promise.all([
    db.select().from(dishCategories),
    db.select({ categoryId: categoryPlans.categoryId, planId: categoryPlans.planId }).from(categoryPlans),
    db.select({ id: plans.id, planType: plans.planType }).from(plans),
  ]);
  return { categories, memberships, plans: planRows };
}

/** `fresh`: write validation reads the DB, never another isolate's 5 s-old copy. */
export function dishCategoryRef(opts: { fresh?: boolean } = {}): Promise<CategoryRef> {
  return opts.fresh ? loadRef() : refCache.getOrSet("all", loadRef);
}
