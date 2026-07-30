import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { dishPlans, dishes, plans } from "@/db/schema";
import { dishIdsForPlan } from "../selections.service";

// The food-safety boundary. `diet` is gone: a dish reaches a subscriber only if
// an admin attached it to that subscriber's plan. If this breaks, a vegetarian
// gets offered meat, so it is asserted directly rather than through the UI.
const NAMES = ["TEST_MEMBERSHIP_VEG", "TEST_MEMBERSHIP_MEAT"];

async function cleanup() {
  const rows = await db.select({ id: dishes.id }).from(dishes).where(inArray(dishes.name, NAMES));
  if (rows.length) {
    await db.delete(dishPlans).where(inArray(dishPlans.dishId, rows.map((r) => r.id)));
    await db.delete(dishes).where(inArray(dishes.name, NAMES));
  }
}

describe("dish → plan membership", () => {
  beforeEach(cleanup);
  afterAll(cleanup);

  it("a non-veg dish is never returned for the veg plan", async () => {
    const [vegPlan] = await db.select({ id: plans.id }).from(plans).where(eq(plans.key, "veg")).limit(1);
    const [nonVegPlan] = await db.select({ id: plans.id }).from(plans).where(eq(plans.key, "non-veg")).limit(1);
    expect(vegPlan, "seed must provide a veg plan").toBeDefined();
    expect(nonVegPlan, "seed must provide a non-veg plan").toBeDefined();

    const [veg] = await db.insert(dishes).values({ name: NAMES[0], category: "sabzi" }).returning();
    const [meat] = await db.insert(dishes).values({ name: NAMES[1], category: "curry" }).returning();

    // A veg dish serves BOTH plans; a meat dish only the non-veg plan.
    await db.insert(dishPlans).values([
      { dishId: veg.id, planId: vegPlan.id },
      { dishId: veg.id, planId: nonVegPlan.id },
      { dishId: meat.id, planId: nonVegPlan.id },
    ]);

    const vegAllowed = await dishIdsForPlan(vegPlan.id);
    expect(vegAllowed.has(veg.id)).toBe(true);
    expect(vegAllowed.has(meat.id)).toBe(false);

    // The shared veg dish still appears on the non-veg plan — that sharing is
    // the reason membership is many-to-many rather than one plan per dish.
    const nonVegAllowed = await dishIdsForPlan(nonVegPlan.id);
    expect(nonVegAllowed.has(veg.id)).toBe(true);
    expect(nonVegAllowed.has(meat.id)).toBe(true);
  });

  // The write path the admin form will use: a dish can be attached to several
  // plans at once, and re-setting replaces the whole set rather than appending.
  it("setPlans attaches a dish to MULTIPLE plans and is idempotent", async () => {
    const { dishesService } = await import("@/lib/services/dishes.service");
    const [dish] = await db.insert(dishes).values({ name: NAMES[0], category: "sabzi" }).returning();
    // setPlans speaks plan public_ids (what the admin form will hold), not keys.
    const planIds = Object.fromEntries(
      (await db.select({ key: plans.key, publicId: plans.publicId }).from(plans)).map((p) => [p.key, p.publicId]),
    );

    await dishesService.setPlans(dish.publicId, [planIds["veg"], planIds["non-veg"]]);
    expect((await dishesService.plansByDish()).get(dish.publicId)).toHaveLength(2);

    // Re-setting to one plan replaces, not appends.
    await dishesService.setPlans(dish.publicId, [planIds["non-veg"]]);
    expect((await dishesService.plansByDish()).get(dish.publicId)).toHaveLength(1);

    // And an empty set is refused — an unattached dish is invisible everywhere.
    await expect(dishesService.setPlans(dish.publicId, [])).rejects.toThrow();
  });

  // The catalog form posts planIds alongside the ordinary columns; the service
  // splits it out. Without this, a dish created through the admin UI would land
  // with no membership and be invisible on every menu.
  it("create/update through the catalog form persists planIds", async () => {
    const { dishesService } = await import("@/lib/services/dishes.service");
    const planIds = Object.fromEntries(
      (await db.select({ key: plans.key, publicId: plans.publicId }).from(plans)).map((p) => [p.key, p.publicId]),
    );

    const created = await dishesService.create({
      name: NAMES[0],
      category: "sabzi",
      planIds: [planIds["veg"], planIds["non-veg"]],
    });
    expect((await dishesService.plansByDish()).get(created.publicId)).toHaveLength(2);

    await dishesService.update(created.publicId, { planIds: [planIds["veg"]] });
    expect((await dishesService.plansByDish()).get(created.publicId)).toHaveLength(1);

    // A create with no plans is refused rather than producing an invisible dish.
    await expect(dishesService.create({ name: NAMES[1], category: "curry", planIds: [] })).rejects.toThrow();
  });

  it("a dish attached to no plan is invisible everywhere", async () => {
    const [orphan] = await db.insert(dishes).values({ name: NAMES[0], category: "sabzi" }).returning();
    for (const p of await db.select({ id: plans.id }).from(plans)) {
      expect((await dishIdsForPlan(p.id)).has(orphan.id)).toBe(false);
    }
  });
});
