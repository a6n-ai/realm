import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { dishes, plans } from "@/db/schema";
import { dishIdsForPlan } from "../selections.service";

// The food-safety boundary. `diet` is gone: a dish reaches a subscriber only if
// its planId matches that subscriber's plan. If this breaks, a vegetarian gets
// offered meat, so it is asserted directly rather than through the UI.
const NAMES = ["TEST_MEMBERSHIP_VEG", "TEST_MEMBERSHIP_MEAT"];

async function cleanup() {
  await db.delete(dishes).where(inArray(dishes.name, NAMES));
}

describe("dish → plan membership", () => {
  beforeEach(cleanup);
  afterAll(cleanup);

  it("a non-veg dish is never returned for the veg plan", async () => {
    const [vegPlan] = await db.select({ id: plans.id }).from(plans).where(eq(plans.key, "veg")).limit(1);
    const [nonVegPlan] = await db.select({ id: plans.id }).from(plans).where(eq(plans.key, "non-veg")).limit(1);
    expect(vegPlan, "seed must provide a veg plan").toBeDefined();
    expect(nonVegPlan, "seed must provide a non-veg plan").toBeDefined();

    const [veg] = await db.insert(dishes).values({ name: NAMES[0], category: "sabzi", planId: vegPlan.id }).returning();
    const [meat] = await db.insert(dishes).values({ name: NAMES[1], category: "sabzi", planId: nonVegPlan.id }).returning();

    const vegAllowed = await dishIdsForPlan(vegPlan.id);
    expect(vegAllowed.has(veg.id)).toBe(true);
    expect(vegAllowed.has(meat.id)).toBe(false);

    const nonVegAllowed = await dishIdsForPlan(nonVegPlan.id);
    expect(nonVegAllowed.has(meat.id)).toBe(true);
    expect(nonVegAllowed.has(veg.id)).toBe(false);
  });

  // The write path the admin form uses: a dish belongs to exactly one plan, and
  // re-setting replaces it rather than adding a second.
  it("setPlans moves a dish to a different single plan", async () => {
    const { dishesService } = await import("@/lib/services/dishes.service");
    const [vegPlan] = await db.select({ id: plans.id, publicId: plans.publicId }).from(plans).where(eq(plans.key, "veg")).limit(1);
    const [nonVegPlan] = await db.select({ id: plans.id, publicId: plans.publicId }).from(plans).where(eq(plans.key, "non-veg")).limit(1);
    const [dish] = await db.insert(dishes).values({ name: NAMES[0], category: "sabzi", planId: vegPlan.id }).returning();

    await dishesService.update(dish.publicId, { planId: nonVegPlan.publicId });
    const [row] = await db.select({ planId: dishes.planId }).from(dishes).where(eq(dishes.id, dish.id));
    expect(row.planId).toBe(nonVegPlan.id);
  });

  // The catalog form posts planId alongside the ordinary columns; the service
  // resolves it to plans.id. Without this, a dish created through the admin UI
  // would land with no plan and be invisible on every menu.
  it("create/update through the catalog form persists planId", async () => {
    const { dishesService } = await import("@/lib/services/dishes.service");
    const [vegPlan] = await db.select({ id: plans.id, publicId: plans.publicId }).from(plans).where(eq(plans.key, "veg")).limit(1);
    const [nonVegPlan] = await db.select({ id: plans.id, publicId: plans.publicId }).from(plans).where(eq(plans.key, "non-veg")).limit(1);

    const created = await dishesService.create({ name: NAMES[0], category: "sabzi", planId: vegPlan.publicId });
    const [row1] = await db.select({ planId: dishes.planId }).from(dishes).where(eq(dishes.id, created.id));
    expect(row1.planId).toBe(vegPlan.id);

    await dishesService.update(created.publicId, { planId: nonVegPlan.publicId });
    const [row2] = await db.select({ planId: dishes.planId }).from(dishes).where(eq(dishes.id, created.id));
    expect(row2.planId).toBe(nonVegPlan.id);

    // A create with no plan is refused by the schema rather than producing an orphan dish.
    await expect(dishesService.create({ name: NAMES[1], category: "sabzi", planId: "" })).rejects.toThrow();
  });
});
