import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { categoryPlans, dishCategories, plans } from "@/db/schema";
import { attachCategoryToPlans } from "@/db/test-helpers";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
const { dishCategoriesService } = await import("../dish-categories.service");

/** Keys this file owns, so seeded slots in the same table do not skew equality. */
const own = (rows: { key: string }[]) => rows.map((r) => r.key).filter((k) => OWN_KEYS.includes(k));

// Scope cleanup to this file's own slots. Wiping dish_categories wholesale also
// orphans the seeded category_plans rows, and every later test in the serial run
// then resolves zero categories.
const OWN_KEYS = ["breakfast", "lunch", "dinner"];

async function reset() {
  const own = await db
    .select({ id: dishCategories.id })
    .from(dishCategories)
    .where(inArray(dishCategories.key, OWN_KEYS));
  if (own.length) {
    await db.delete(categoryPlans).where(inArray(categoryPlans.categoryId, own.map((r) => r.id)));
    await db.delete(dishCategories).where(inArray(dishCategories.key, OWN_KEYS));
  }
}

describe("dishCategoriesService.enabledCategories", () => {
  beforeEach(async () => {
    await reset();
    await db.insert(dishCategories).values([
      { key: "breakfast", label: "Breakfast", enabled: false, sortOrder: 0 },
      { key: "lunch", label: "Lunch", enabled: true, sortOrder: 1 },
      { key: "dinner", label: "Dinner", enabled: false, sortOrder: 2 },
    ]);
    const own = await db
      .select({ id: dishCategories.id })
      .from(dishCategories)
      .where(inArray(dishCategories.key, OWN_KEYS));
    for (const c of own) await attachCategoryToPlans(c.id);
  });
  afterAll(reset);

  it("returns only enabled categories in sort order", async () => {
    const categories = await dishCategoriesService.enabledCategories();
    // Seeded slots share the table; assert only about this file's own keys.
    expect(categories.map((c) => c.key).filter((k) => OWN_KEYS.includes(k))).toEqual(["lunch"]);
  });
});

// `key` is globally unique now: a slot used by several plans is ONE row attached
// to each, rather than a duplicate row per plan type. These cover membership.
describe("dishCategoriesService plan membership", () => {
  beforeEach(reset);
  afterAll(reset);

  async function seedSlots() {
    const rows = await db
      .insert(dishCategories)
      .values([
        { key: "breakfast", label: "Breakfast", enabled: true, sortOrder: 0 },
        { key: "lunch", label: "Lunch", enabled: true, selectable: true, sortOrder: 1 },
        { key: "dinner", label: "Dinner", enabled: false, sortOrder: 2 },
      ])
      .returning({ id: dishCategories.id, key: dishCategories.key });
    return new Map(rows.map((r) => [r.key, r.id]));
  }

  it("forPlan returns only slots attached to that plan, enabled, ordered", async () => {
    const slots = await seedSlots();
    // lunch on both plans, breakfast only on healthy.
    await attachCategoryToPlans(slots.get("lunch")!, ["veg", "healthy"]);
    await attachCategoryToPlans(slots.get("breakfast")!, ["healthy"]);
    await attachCategoryToPlans(slots.get("dinner")!, ["veg"]); // disabled → excluded

    const [veg] = await db.select({ id: plans.id }).from(plans).where(eq(plans.key, "veg")).limit(1);
    const [healthy] = await db.select({ id: plans.id }).from(plans).where(eq(plans.key, "healthy")).limit(1);

    expect(own(await dishCategoriesService.forPlan(veg.id))).toEqual(["lunch"]);
    expect(own(await dishCategoriesService.forPlan(healthy.id))).toEqual(["breakfast", "lunch"]);
  });

  it("forPlanType unions the slots of every plan of that type, without duplicates", async () => {
    const slots = await seedSlots();
    // Attached to BOTH tiffin plans — the join would return it twice.
    await attachCategoryToPlans(slots.get("lunch")!, ["veg", "non-veg"]);
    await attachCategoryToPlans(slots.get("breakfast")!, ["healthy"]);

    expect(own(await dishCategoriesService.forPlanType("tiffin"))).toEqual(["lunch"]);
    expect(own(await dishCategoriesService.forPlanType("healthy"))).toEqual(["breakfast"]);
  });

  it("surfaces the selectable flag", async () => {
    const slots = await seedSlots();
    await attachCategoryToPlans(slots.get("lunch")!, ["veg"]);
    const [veg] = await db.select({ id: plans.id }).from(plans).where(eq(plans.key, "veg")).limit(1);
    const rows = await dishCategoriesService.forPlan(veg.id);
    expect(rows.find((r) => r.key === "lunch")?.selectable).toBe(true);
  });

  it("a slot attached to no plan is returned by no plan", async () => {
    const slots = await seedSlots();
    void slots;
    for (const p of await db.select({ id: plans.id }).from(plans)) {
      expect(own(await dishCategoriesService.forPlan(p.id))).toEqual([]);
    }
  });
});
