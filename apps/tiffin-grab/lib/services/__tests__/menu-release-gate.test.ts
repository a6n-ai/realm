// P2: the draft → ready → released workflow, the gate that stops a menu going live with a
// hole in it, and the amend impact report. The gate matters because the builder shows the
// union of a plan type's categories and filters dishes by dishes.category, while what a
// subscriber actually receives is filtered by dish_plans — so a week can look complete and
// serve nobody on one plan.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, gte, inArray, like, lt } from "drizzle-orm";
import { db } from "@/db/client";
import { categoryIdFor } from "@/db/test-helpers";
import { deliveryFrequencies, dishPlans, dishes, mealSelections, mealSizes, menuItems, menuWeeks, orders, plans, users } from "@/db/schema";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
const { menuService } = await import("../menu.service");

// Everything this suite creates is prefixed, and cleanup is scoped to those prefixes.
// The table-wide `delete(dishes)` the older menu suites use takes the seeded catalog with
// it, which is what makes ensure-current-menu-week lose whenever it runs afterwards.
const P = "P2GATE";

async function reset() {
  // week_start is a date column, so scope by range rather than a text pattern.
  const myWeeks = await db.select({ id: menuWeeks.id }).from(menuWeeks)
    .where(and(gte(menuWeeks.weekStart, "2099-01-01"), lt(menuWeeks.weekStart, "2100-01-01")));
  const weekIds = myWeeks.map((w) => w.id);
  if (weekIds.length) {
    await db.delete(mealSelections).where(inArray(mealSelections.menuWeekId, weekIds));
    await db.delete(menuItems).where(inArray(menuItems.menuWeekId, weekIds));
  }
  await db.delete(orders).where(like(orders.deploymentId, `${P}-%`));
  if (weekIds.length) await db.delete(menuWeeks).where(inArray(menuWeeks.id, weekIds));

  const myDishes = await db.select({ id: dishes.id }).from(dishes).where(like(dishes.name, `${P} %`));
  if (myDishes.length) {
    const dishIds = myDishes.map((d) => d.id);
    await db.delete(dishPlans).where(inArray(dishPlans.dishId, dishIds));
    await db.delete(dishes).where(inArray(dishes.id, dishIds));
  }
  await db.delete(users).where(like(users.email, `${P.toLowerCase()}-%`));
}

/** A dish in `category`, attached only to the named plans. Membership is the whole point. */
async function dishOn(name: string, category: string, planKeys: string[]) {
  const [dish] = await db.insert(dishes).values({ name: `${P} ${name}`, category }).returning();
  const planRows = await db.select({ id: plans.id, key: plans.key }).from(plans);
  for (const key of planKeys) {
    const plan = planRows.find((p) => p.key === key)!;
    await db.insert(dishPlans).values({ dishId: dish.id, planId: plan.id });
  }
  return dish.publicId;
}

/** Selections for one week only — the seeded catalog shares these tables. */
const picksFor = (weekId: bigint) =>
  db.select().from(mealSelections).where(eq(mealSelections.menuWeekId, weekId));

const item = (dishId: string, slot: string, dayOfWeek: "mon" | "tue" = "mon", isDefault = false) =>
  ({ id: null, dayOfWeek, slot, dishId, isDefault });

describe("menuService release gate", () => {
  beforeEach(reset);
  afterAll(reset);

  it("blocks release when a plan has no dish in a category its meal sizes require", async () => {
    // Attached to non-veg only: the veg plan's Monday sabzi is empty even though the day
    // looks full in the builder.
    const nonVegOnly = await dishOn("Chicken Curry", "sabzi", ["non-veg"]);
    const week = await menuService.upsertWeek({ weekStart: "2099-09-07" });
    await menuService.saveWeek({ menuWeekId: week.publicId, expectedUpdatedAt: week.updatedAt, items: [item(nonVegOnly, "sabzi")] });

    const problems = await menuService.releaseProblems(week.publicId);
    expect(problems.some((p) => p.categoryLabel.toLowerCase().includes("sabzi"))).toBe(true);
    await expect(menuService.release(week.publicId)).rejects.toThrow(/without a meal/i);

    const [stored] = await db.select().from(menuWeeks).where(eq(menuWeeks.publicId, week.publicId));
    expect(stored.status).toBe("draft");
  });

  it("does not flag a day that has no dishes at all — skipping a day is a choice, not a hole", async () => {
    const shared = await dishOn("Paneer", "sabzi", ["veg", "non-veg"]);
    const week = await menuService.upsertWeek({ weekStart: "2099-09-14" });
    await menuService.saveWeek({ menuWeekId: week.publicId, expectedUpdatedAt: week.updatedAt, items: [item(shared, "sabzi", "mon")] });

    const problems = await menuService.releaseProblems(week.publicId);
    expect(problems.filter((p) => p.day !== "mon")).toEqual([]);
  });

  it("a fixed category with one dish PER PLAN is correct, not surplus", async () => {
    // The membership filter runs before "take the first dish", so several dishes in one
    // fixed category can be right — one per plan. A naive count of rows in the cell would
    // wrongly flag this, which is precisely the mistake the plan-aware check avoids.
    // "daal" (not "extra"): the TU redesign dropped Extra from every meal size's
    // composition, so releaseProblems no longer treats it as required by any plan —
    // daal still is, on both tiffin plans' seeded meal sizes.
    const vegOnly = await dishOn("Papad", "daal", ["veg"]);
    const nonVegOnly = await dishOn("Egg Bhurji", "daal", ["non-veg"]);
    const week = await menuService.upsertWeek({ weekStart: "2099-09-28" });
    await menuService.saveWeek({
      menuWeekId: week.publicId, expectedUpdatedAt: week.updatedAt,
      items: [item(vegOnly, "daal"), item(nonVegOnly, "daal")],
    });

    const surplus = (await menuService.releaseProblems(week.publicId)).filter((p) => p.kind === "extra");
    expect(surplus).toEqual([]);
  });

  it("flags a fixed category holding two dishes that reach the SAME plan", async () => {
    // Both are on the veg plan, so only one can ever be served to a veg subscriber.
    const a = await dishOn("Papad", "daal", ["veg", "non-veg"]);
    const b = await dishOn("Pickle", "daal", ["veg", "non-veg"]);
    const week = await menuService.upsertWeek({ weekStart: "2099-10-26" });
    await menuService.saveWeek({
      menuWeekId: week.publicId, expectedUpdatedAt: week.updatedAt,
      items: [item(a, "daal"), item(b, "daal")],
    });

    const surplus = (await menuService.releaseProblems(week.publicId)).filter((p) => p.kind === "extra");
    expect(surplus.map((p) => p.planName).sort()).toEqual(["Non-Veg Plan", "Pure Vegetarian Plan"]);
    expect(surplus[0].dishNames).toHaveLength(2);
    // Surplus is a warning, never a blocker — only a missing category stops a release.
    expect(surplus.every((p) => p.kind !== "missing")).toBe(true);
  });

  it("refuses to release an empty week only via the caller — a week with no items has no problems to report", async () => {
    const week = await menuService.upsertWeek({ weekStart: "2099-09-21" });
    expect(await menuService.releaseProblems(week.publicId)).toEqual([]);
  });
});

describe("menuService draft → ready → released", () => {
  beforeEach(reset);
  afterAll(reset);

  const status = async (publicId: string) =>
    (await db.select({ status: menuWeeks.status }).from(menuWeeks).where(eq(menuWeeks.publicId, publicId)))[0].status;

  it("moves draft → ready → draft, and blocks edits while ready", async () => {
    const shared = await dishOn("Paneer", "sabzi", ["veg", "non-veg"]);
    const week = await menuService.upsertWeek({ weekStart: "2099-10-05" });
    const saved = await menuService.saveWeek({ menuWeekId: week.publicId, expectedUpdatedAt: week.updatedAt, items: [item(shared, "sabzi")] });

    await menuService.markReady(week.publicId);
    expect(await status(week.publicId)).toBe("ready");

    const [ready] = await db.select().from(menuWeeks).where(eq(menuWeeks.publicId, week.publicId));
    await expect(menuService.saveWeek({
      menuWeekId: week.publicId, expectedUpdatedAt: ready.updatedAt, items: saved.items,
    })).rejects.toThrow(/marked ready/i);

    await menuService.backToDraft(week.publicId);
    expect(await status(week.publicId)).toBe("draft");
  });

  it("rejects markReady on anything but a draft, and backToDraft on anything but ready", async () => {
    const week = await menuService.upsertWeek({ weekStart: "2099-10-12" });
    await expect(menuService.backToDraft(week.publicId)).rejects.toThrow(/marked ready/i);
    await menuService.markReady(week.publicId);
    await expect(menuService.markReady(week.publicId)).rejects.toThrow(/only a draft/i);
  });
});

describe("menuService amend", () => {
  beforeEach(reset);
  afterAll(reset);

  /** A released week with one order holding an explicit pick on `pickedDish`. */
  async function releasedWeekWithPick() {
    const keep = await dishOn("Paneer", "sabzi", ["veg", "non-veg"]);
    const picked = await dishOn("Bhindi", "sabzi", ["veg", "non-veg"]);
    const week = await menuService.upsertWeek({ weekStart: "2099-11-02" });
    const saved = await menuService.saveWeek({
      menuWeekId: week.publicId, expectedUpdatedAt: week.updatedAt,
      items: [item(keep, "sabzi", "mon", true), item(picked, "sabzi", "mon")],
    });
    // Released directly, not through release(): the seeded plans require a dozen categories,
    // and this fixture is about amending a live week, not about satisfying the gate.
    await db.update(menuWeeks).set({ status: "released", releasedAt: Date.now() }).where(eq(menuWeeks.publicId, week.publicId));

    const [weekRow] = await db.select().from(menuWeeks).where(eq(menuWeeks.publicId, week.publicId));
    const [user] = await db.insert(users).values({ email: `${P.toLowerCase()}-${Math.random().toString(36).slice(2)}@test.invalid`, phone: "+16475559111", role: "user" }).returning();
    const [pickedDish] = await db.select().from(dishes).where(eq(dishes.publicId, picked));
    const [vegPlan] = await db.select({ id: plans.id }).from(plans).where(eq(plans.key, "veg"));
    const [size] = await db.select({ id: mealSizes.id }).from(mealSizes).where(eq(mealSizes.planId, vegPlan.id)).limit(1);
    const [freq] = await db.select({ id: deliveryFrequencies.id }).from(deliveryFrequencies).limit(1);
    const [order] = await db.insert(orders).values({
      userId: user.id, planId: vegPlan.id, mealSizeId: size.id, frequencyId: freq.id,
      persons: 1, mealSlots: ["lunch"], categoryCounts: { sabzi: 1 },
      durationWeeks: 1, startDate: "2099-11-02", tiffinCount: 5, perTiffinPrice: "10.00",
      pricingSnapshot: {}, total: "50.00", status: "active", deploymentId: `${P}-${Math.random().toString(36).slice(2, 7)}`,
      fullName: "T", addressLine: "1", city: "Toronto", postalCode: "M5V 2T6",
    }).returning();
    await db.insert(mealSelections).values({
      orderId: order.id, menuWeekId: weekRow.id, dayOfWeek: "mon", categoryId: await categoryIdFor("sabzi"),
      personIndex: 1, pickIndex: 1, dishId: pickedDish.id,
    });
    return { week: weekRow, saved, keep, picked };
  }

  it("counts the picks an amend would reset, without writing anything", async () => {
    const { week, saved, keep } = await releasedWeekWithPick();
    const withoutPicked = saved.items.filter((i) => i.dishId === keep);

    const impact = await menuService.amendImpact({ menuWeekId: week.publicId, items: withoutPicked });
    expect(impact.resetPicks).toBe(1);
    expect(impact.affectedOrders).toBe(1);
    expect(impact.days).toEqual(["mon"]);
    // Preview only — the selection is still there.
    expect(await picksFor(week.id)).toHaveLength(1);
  });

  it("reports zero when the amend leaves every chosen dish in place", async () => {
    const { week, saved } = await releasedWeekWithPick();
    expect((await menuService.amendImpact({ menuWeekId: week.publicId, items: saved.items })).resetPicks).toBe(0);
  });

  it("refuses to save a released week without amend, and clears the broken picks with it", async () => {
    const { week, saved, keep } = await releasedWeekWithPick();
    const withoutPicked = saved.items.filter((i) => i.dishId === keep);

    await expect(menuService.saveWeek({
      menuWeekId: week.publicId, expectedUpdatedAt: week.updatedAt, items: withoutPicked,
    })).rejects.toThrow(/released/i);
    expect(await picksFor(week.id)).toHaveLength(1);

    const result = await menuService.saveWeek({
      menuWeekId: week.publicId, expectedUpdatedAt: week.updatedAt, items: withoutPicked, amend: true,
    });
    expect(result.resetPicks).toBe(1);
    // Deleted, not left dangling: resolution now falls to the default explicitly.
    expect(await picksFor(week.id)).toHaveLength(0);
    expect(await db.select().from(menuItems).where(eq(menuItems.menuWeekId, week.id))).toHaveLength(1);
  });
});
