import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";

const { db } = await import("@/db/client");
const { categorySwapPairs, dishCategories, dishes, mealSizeItems, mealSizes, plans } = await import("@/db/schema");
const { dishCategoriesService: svc } = await import("../dish-categories.service");

const TAG = `swpscope-${Date.now()}`;

describe("meal-size-scoped swap pair rules", () => {
  let planPublicId = "";
  let nonVegPublicId = "";
  const sizes: { id: bigint; publicId: string }[] = [];
  const pairIds: string[] = [];

  async function makeSize(suffix: string, items: [string, number][]) {
    const [plan] = await db.select().from(plans).where(eq(plans.publicId, "pln_veg"));
    planPublicId = plan.publicId;
    const [nv] = await db.select().from(plans).where(eq(plans.publicId, "pln_halal_nonveg"));
    nonVegPublicId = nv.publicId;
    const [s] = await db.insert(mealSizes).values({
      key: `${TAG}-${suffix}`, name: `${TAG} ${suffix}`, planId: plan.id, tier: "budget",
      kcalMin: 1, kcalMax: 2, basePrice: "1.00",
    }).returning();
    await db.insert(mealSizeItems).values(items.map(([category, tu], i) => ({
      mealSizeId: s.id, name: category, category, planId: plan.id, tuAmount: String(tu), sortOrder: i,
    })));
    sizes.push({ id: s.id, publicId: s.publicId });
    return s;
  }

  let a: Awaited<ReturnType<typeof makeSize>>;

  beforeAll(async () => {
    a = await makeSize("a", [["rice", 1], ["roti", 1], ["sabzi", 1]]);
  });

  afterAll(async () => {
    await db.delete(dishes).where(eq(dishes.category, `${TAG}tgt`));
    if (pairIds.length) await db.delete(categorySwapPairs).where(inArray(categorySwapPairs.publicId, pairIds));
    const ids = sizes.map((s) => s.id);
    if (ids.length) {
      await db.delete(mealSizeItems).where(inArray(mealSizeItems.mealSizeId, ids));
      await db.delete(mealSizes).where(inArray(mealSizes.id, ids));
    }
    await db.delete(dishCategories).where(eq(dishCategories.key, `${TAG}tgt`));
  });

  it("meal-size rule beats plan and all-plans rules whatever the row order, without leaking to a sibling size", async () => {
    // Own sizes on the veg plan so existing rice>roti rows (all-plans, maybe veg) can't interfere.
    const c = await makeSize("c", [["rice", 1], ["roti", 1]]);
    const d = await makeSize("d", [["rice", 1], ["roti", 1]]);
    const e = await makeSize("e", [["rice", 1], ["roti", 1]]);
    const lowerId = await svc.addSwapPair("rice", "roti", null, { exchangeOverrides: [{ giveTu: 1, receiveTu: 0.25 }], mealSizePublicId: d.publicId });
    pairIds.push(lowerId.publicId);
    const planRule = await db.select({ id: categorySwapPairs.id }).from(categorySwapPairs).where(eq(categorySwapPairs.planId, d.planId));
    const existing = planRule.length > 0;
    if (!existing) pairIds.push((await svc.addSwapPair("rice", "roti", planPublicId, { exchangeOverrides: [{ giveTu: 1, receiveTu: 0.5 }] })).publicId);
    const higherId = await svc.addSwapPair("rice", "roti", null, { exchangeOverrides: [{ giveTu: 1, receiveTu: 0.25 }], mealSizePublicId: c.publicId });
    pairIds.push(higherId.publicId);
    expect(higherId.planId).toBe(c.planId);
    expect(higherId.mealSizeId).toBe(c.id);
    expect(lowerId.id < higherId.id).toBe(true);
    const quarter = [{ giveTu: 1, receiveTu: 0.25 }];
    expect((await svc.swapPairRuleForMealSize("rice", "roti", c.id))?.overrides).toEqual(quarter);
    expect((await svc.swapPairRuleForMealSize("rice", "roti", d.id))?.overrides).toEqual(quarter);
    expect((await svc.swapPairRuleForMealSize("rice", "roti", e.id))?.overrides).not.toEqual(quarter);
  });

  it("a meal-size row with a LOWER id than the plan row still wins", async () => {
    const f = await makeSize("f", [["daal", 1], ["sabzi", 1]]);
    const low = await svc.addSwapPair("daal", "sabzi", null, { exchangeOverrides: [{ giveTu: 1, receiveTu: 0.75 }], mealSizePublicId: f.publicId });
    pairIds.push(low.publicId);
    const hi = await svc.addSwapPair("daal", "sabzi", planPublicId, { exchangeOverrides: [{ giveTu: 1, receiveTu: 0.5 }] }).catch(() => null);
    if (hi) pairIds.push(hi.publicId);
    expect(hi == null || hi.id > low.id).toBe(true);
    expect((await svc.swapPairRuleForMealSize("daal", "sabzi", f.id))?.overrides).toEqual([{ giveTu: 1, receiveTu: 0.75 }]);
  });

  it("a meal-size rule counts when its target's dishes sit on a reachable plan other than the rule's own", async () => {
    const [veg] = await db.select().from(plans).where(eq(plans.publicId, "pln_veg"));
    const [nv] = await db.select().from(plans).where(eq(plans.publicId, "pln_halal_nonveg"));
    const key = `${TAG}tgt`;
    await db.insert(dishCategories).values({ key, label: key, enabled: true });
    await db.insert(dishes).values({ planId: veg.id, name: key, category: key });
    const [s] = await db.insert(mealSizes).values({
      key: `${TAG}-nv`, name: `${TAG} nv`, planId: nv.id, tier: "budget", kcalMin: 1, kcalMax: 2, basePrice: "1.00",
    }).returning();
    sizes.push({ id: s.id, publicId: s.publicId });
    await db.insert(mealSizeItems).values([
      { mealSizeId: s.id, name: "rice", category: "rice", planId: nv.id, tuAmount: "1", sortOrder: 0 },
      { mealSizeId: s.id, name: key, category: key, planId: veg.id, tuAmount: "1", sortOrder: 1 },
    ]);
    const all = await svc.addSwapPair("rice", key, null, { exchangeOverrides: [{ giveTu: 1, receiveTu: 0.5 }] });
    const sized = await svc.addSwapPair("rice", key, null, { exchangeOverrides: [{ giveTu: 1, receiveTu: 0.25 }], mealSizePublicId: s.publicId });
    pairIds.push(all.publicId, sized.publicId);
    expect((await svc.swapPairRuleForMealSize("rice", key, s.id))?.overrides).toEqual([{ giveTu: 1, receiveTu: 0.25 }]);
  });

  it("editSwapPair keeps the meal size when omitted and clears it on null", async () => {
    const g = await makeSize("g", [["salad", 1], ["raita", 1]]);
    const row = await svc.addSwapPair("raita", "salad", null, { mealSizePublicId: g.publicId });
    pairIds.push(row.publicId);
    const kept = await svc.editSwapPair(row.publicId, "raita", "salad", null, { receivesMissing: true });
    expect(kept.mealSizeId).toBe(g.id);
    expect(kept.planId).toBe(g.planId);
    await expect(svc.editSwapPair(row.publicId, "raita", "salad", nonVegPublicId, {})).rejects.toThrow("Meal size is not on this plan");
    const cleared = await svc.editSwapPair(row.publicId, "raita", "salad", planPublicId, { mealSizePublicId: null });
    expect(cleared.mealSizeId).toBeNull();
    expect(cleared.planId).toBe(g.planId);
  });

  it("receivesMissing pairs surface only when flagged", async () => {
    const row = await svc.addSwapPair("sabzi", "salad", null, { mealSizePublicId: a.publicId, receivesMissing: true });
    pairIds.push(row.publicId);
    const offered = async () => (await svc.swapPairsForMealSize(a.id)).find((p) => p.fromCategory === "sabzi" && p.toCategory === "salad");
    expect((await offered())?.receivesMissing).toBe(true);
    await svc.editSwapPair(row.publicId, "sabzi", "salad", null, { mealSizePublicId: a.publicId, receivesMissing: false });
    expect(await offered()).toBeUndefined();
  });

  it("lists the scope columns", async () => {
    pairIds.push((await svc.addSwapPair("roti", "rice", null, { mealSizePublicId: a.publicId })).publicId);
    const listed = (await svc.listSwapPairs()).find((p) => p.fromKey === "roti" && p.toKey === "rice" && p.mealSizeId === a.publicId);
    expect(listed?.mealSizeName).toBe(a.name);
    expect(listed?.receivesMissing).toBe(false);
  });

  it("rejects a duplicate for the same meal size", async () => {
    await expect(svc.addSwapPair("roti", "rice", null, { mealSizePublicId: a.publicId })).rejects.toThrow("This swap rule already exists for this direction and plan.");
  });

  it("rejects a meal size that is not on the given plan", async () => {
    await expect(svc.addSwapPair("roti", "rice", nonVegPublicId, { mealSizePublicId: a.publicId })).rejects.toThrow("Meal size is not on this plan");
  });
});
