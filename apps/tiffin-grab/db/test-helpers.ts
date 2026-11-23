import { postgresOptions } from "@foundry/database";
import { count, eq, inArray, ne } from "drizzle-orm";
import { db } from "./client";
import { categoryPlans, dishCategories, dishes, notificationOutbox, plans, users } from "./schema";
import { databaseUrl } from "../lib/runtime/env";
import { invalidateDishCategories } from "../lib/menu/dish-category-ref";
import { invalidateMealSizeFacts } from "../lib/menu/meal-size-facts";
import { invalidateAssignableStaff } from "../lib/staff/assignable-staff";
import { invalidatePausePackages } from "../lib/deliveries/pause-package-cache";
import { invalidateFilterOptions } from "../lib/list/filter-options-cache";

/**
 * inquiriesService.create resolves an inbound lead's owner to the system user and throws
 * "system user not seeded" without one. seed.sql creates no logins, so a suite that creates
 * inquiries must not rely on an earlier file having inserted it. Idempotent.
 */
export async function ensureSystemUser(): Promise<void> {
  const [sys] = await db.select({ id: users.id }).from(users).where(eq(users.isSystem, true)).limit(1);
  if (sys) return;
  await db.insert(users).values({ name: "System", email: "system@tiffingrab.internal", role: "admin", isSystem: true });
  await invalidateAssignableStaff();
}

/**
 * Test teardown: remove every non-system user. Order creation enqueues notification_outbox rows that
 * reference the user (FK), so they go first or the delete fails on whatever the DB already holds.
 */
export async function deleteNonSystemUsers(): Promise<void> {
  const ids = db.select({ id: users.id }).from(users).where(ne(users.isSystem, true));
  await db.delete(notificationOutbox).where(inArray(notificationOutbox.recipientId, ids));
  await db.delete(users).where(ne(users.isSystem, true));
  await invalidateAssignableStaff();
}

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
  await invalidateDishCategories();
  await invalidateMealSizeFacts();
}

/** Attach every existing dish_categories row to every plan. */
export async function attachAllCategoriesToPlans(): Promise<void> {
  const cats = await db.select({ id: dishCategories.id }).from(dishCategories);
  for (const c of cats) await attachCategoryToPlans(c.id);
}

/**
 * Category row id for a key (menu_items and meal_selections hold a foreign key).
 * Throws rather than returning undefined: a typo'd key would insert silently and produce
 * a row nothing could ever resolve.
 */
export async function categoryIdFor(key: string): Promise<bigint> {
  const [row] = await db.select({ id: dishCategories.id }).from(dishCategories).where(eq(dishCategories.key, key)).limit(1);
  if (!row) throw new Error(`categoryIdFor: no dish_categories row with key "${key}" — is the catalog seeded?`);
  return row.id;
}

/**
 * Ensures the seeded catalog (plans, meal sizes, dish categories, dishes) is
 * present in the local test DB. If an earlier suite's reset wiped dishes, this
 * restores it from db/seed.sql idempotently.
 */
export async function ensureSeededCatalog(): Promise<void> {
  const [row] = await db.select({ count: count() }).from(dishes);
  if (Number(row?.count ?? 0) >= 10) return;
  const dbUrl = databaseUrl();
  const postgres = (await import("postgres")).default;
  const raw = postgres(dbUrl, { ...postgresOptions, prepare: false, max: 1 });
  try {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const sqlPath = fileURLToPath(new URL("./seed.sql", import.meta.url));
    await raw.unsafe(readFileSync(sqlPath, "utf8"));
  } finally {
    await raw.end();
  }
}

/**
 * Drops every read-through cache fed by rows that suites write directly (catalog, staff, coin rates,
 * meal rules). Call it from suites that write those rows directly.
 */
export async function evictTestCaches(): Promise<void> {
  // Imported here, not at the top: these services would load the real session module into suites
  // that mock it, ahead of their vi.mock calls.
  const [{ coinRateCache }, { invalidateMealRules }, { evictReleasedWeeks }] = await Promise.all([
    import("../lib/wallet/coin-rate-cache"),
    import("../lib/menu/meal-rules.service"),
    import("../lib/menu/menu.service"),
  ]);
  await coinRateCache.evictAll();
  await invalidateMealRules();
  await evictReleasedWeeks();
  await invalidateDishCategories();
  await invalidateMealSizeFacts();
  await invalidateAssignableStaff();
  await invalidatePausePackages();
  await invalidateFilterOptions();
}
