import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";

const { db } = await import("@/db/client");
const { categorySwapPairs, mealSizeItems, mealSizes, plans } = await import("@/db/schema");
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
  let b: Awaited<ReturnType<typeof makeSize>>;

  beforeAll(async () => {
    a = await makeSize("a", [["rice", 1], ["roti", 1], ["sabzi", 1]]);
    b = await makeSize("b", [["rice", 1], ["roti", 1], ["sabzi", 1]]);
  });

  afterAll(async () => {
    if (pairIds.length) await db.delete(categorySwapPairs).where(inArray(categorySwapPairs.publicId, pairIds));
    const ids = sizes.map((s) => s.id);
    if (ids.length) {
      await db.delete(mealSizeItems).where(inArray(mealSizeItems.mealSizeId, ids));
      await db.delete(mealSizes).where(inArray(mealSizes.id, ids));
    }
  });

  it("meal-size rule beats plan and all-plans rules, without leaking to a sibling size", async () => {
    await svc.addSwapPair("rice", "roti", planPublicId, { exchangeOverrides: [{ giveTu: 1, receiveTu: 0.5 }] }).then((p) => pairIds.push(p.publicId));
    const mealRow = await svc.addSwapPair("rice", "roti", null, { exchangeOverrides: [{ giveTu: 1, receiveTu: 0.25 }], mealSizePublicId: a.publicId });
    pairIds.push(mealRow.publicId);
    expect(mealRow.planId).toBe(a.planId);
    expect(mealRow.mealSizeId).toBe(a.id);
    expect((await svc.swapPairRuleForMealSize("rice", "roti", a.id))?.overrides).toEqual([{ giveTu: 1, receiveTu: 0.25 }]);
    expect((await svc.swapPairRuleForMealSize("rice", "roti", b.id))?.overrides).toEqual([{ giveTu: 1, receiveTu: 0.5 }]);
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
    const listed = (await svc.listSwapPairs()).find((p) => p.fromKey === "rice" && p.toKey === "roti" && p.mealSizeId === a.publicId);
    expect(listed?.mealSizeName).toBe(a.name);
    expect(listed?.receivesMissing).toBe(false);
  });

  it("rejects a duplicate for the same meal size", async () => {
    await expect(svc.addSwapPair("rice", "roti", null, { mealSizePublicId: a.publicId })).rejects.toThrow("This swap rule already exists for this direction and plan.");
  });

  it("rejects a meal size that is not on the given plan", async () => {
    await expect(svc.addSwapPair("roti", "rice", nonVegPublicId, { mealSizePublicId: a.publicId })).rejects.toThrow("Meal size is not on this plan");
  });
});
