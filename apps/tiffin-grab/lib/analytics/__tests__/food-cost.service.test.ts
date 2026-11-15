import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray, like } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { categoryCostRates, deliveries, deliveryCategorySwaps, deliveryFrequencies, mealSizeItems, mealSizes, orders, plans, users } = await import("@/db/schema");
const { buildAnalyticsScope } = await import("../metrics/scope");
const { deliveryPicks, foodCostByDate } = await import("../food-cost.service");

const VEG = 1n;
const NONVEG = 2n;
const ORDER_PLAN = VEG;

const cats = new Map([
  ["sabzi", { tuUnitType: "weight" as const, tuUnitSize: 8, tuUnitLabel: "oz", selectable: true }],
  ["daal", { tuUnitType: "weight" as const, tuUnitSize: 8, tuUnitLabel: "oz", selectable: true }],
]);
const item = (category: string, planId: bigint, tuAmount: number, sortOrder: number) => ({ category, planId, tuAmount: String(tuAmount), sortOrder });
const base = { orderPlanId: ORDER_PLAN, categoriesByKey: cats, swaps: [], addons: [] };

describe("deliveryPicks", () => {
  it("no swaps → one pick per item with the item's plan", () => {
    const items = [item("sabzi", NONVEG, 1.5, 0), item("daal", VEG, 1, 1), item("rice", VEG, 1, 2), item("roti", VEG, 1, 3)];
    expect(deliveryPicks({ ...base, items })).toEqual([
      { category: "sabzi", planId: NONVEG, tu: 1.5 },
      { category: "daal", planId: VEG, tu: 1 },
      { category: "rice", planId: VEG, tu: 1 },
      { category: "roti", planId: VEG, tu: 1 },
    ]);
  });

  it("same-unit swap sabzi→daal keeps 1.5 TU and takes the daal item's plan (VEG)", () => {
    const items = [item("sabzi", NONVEG, 1.5, 0), item("daal", VEG, 1, 1)];
    const swaps = [{ fromCategory: "sabzi", toCategory: "daal", qtyFrom: 1, qtyTo: 1, fromRow: null, receiveTu: null }];
    expect(deliveryPicks({ ...base, items, swaps })).toEqual([
      { category: "daal", planId: VEG, tu: 1 },
      { category: "daal", planId: VEG, tu: 1.5 },
    ]);
  });

  it("a received category missing from the meal takes the order's plan", () => {
    const items = [item("sabzi", NONVEG, 1.5, 0)];
    const swaps = [{ fromCategory: "sabzi", toCategory: "roti", qtyFrom: 1, qtyTo: 1, fromRow: null, receiveTu: null }];
    expect(deliveryPicks({ ...base, items, swaps })).toEqual([{ category: "roti", planId: ORDER_PLAN, tu: 1 }]);
  });

  it("add-on qty 2 adds two picks at its tuAmount and plan", () => {
    const items = [item("daal", VEG, 1, 0)];
    const addons = [{ category: "roti", planId: VEG, tuAmount: 1, qty: 2 }];
    expect(deliveryPicks({ ...base, items, addons })).toEqual([
      { category: "daal", planId: VEG, tu: 1 },
      { category: "roti", planId: VEG, tu: 1 },
      { category: "roti", planId: VEG, tu: 1 },
    ]);
  });

  it("empty items → only add-on picks", () => {
    const addons = [{ category: "roti", planId: VEG, tuAmount: 1, qty: 1 }];
    expect(deliveryPicks({ ...base, items: [], addons })).toEqual([{ category: "roti", planId: VEG, tu: 1 }]);
  });
});

const FROM = "2036-03-01";
const TO = "2036-03-31";
const TZ = "America/Toronto";
const NOW = Date.parse("2036-02-20T16:00:00Z");
const scope = buildAnalyticsScope({}, "all", TZ, NOW);

const USER_EMAIL = "food-cost-svc@test.invalid";
const SIZE_KEYS = ["cost-test-nonveg", "cost-test-empty"];
const RATE_CATEGORIES = ["sabzi", "daal", "salad"];

async function reset() {
  const mine = await db.select({ id: orders.id }).from(orders).where(like(orders.deploymentId, "FCS-%"));
  if (mine.length) {
    await db.delete(deliveries).where(inArray(deliveries.orderId, mine.map((o) => o.id)));
    await db.delete(orders).where(inArray(orders.id, mine.map((o) => o.id)));
  }
  await db.delete(users).where(eq(users.email, USER_EMAIL));
  await db.delete(mealSizes).where(inArray(mealSizes.key, SIZE_KEYS));
  await db.delete(categoryCostRates).where(inArray(categoryCostRates.category, RATE_CATEGORIES));
}

describe("foodCostByDate", () => {
  beforeEach(async () => {
    await reset();
    const [nonVeg] = await db.select().from(plans).where(eq(plans.key, "non-veg"));
    const [veg] = await db.select().from(plans).where(eq(plans.key, "veg"));
    const [freq] = await db.select({ id: deliveryFrequencies.id }).from(deliveryFrequencies).limit(1);
    const [size] = await db
      .insert(mealSizes)
      .values({ key: "cost-test-nonveg", name: "Cost test", planId: nonVeg!.id, tier: "premium", kcalMin: 900, kcalMax: 1300, basePrice: "14.75" })
      .returning();
    const [empty] = await db
      .insert(mealSizes)
      .values({ key: "cost-test-empty", name: "Cost test empty", planId: nonVeg!.id, tier: "premium", kcalMin: 900, kcalMax: 1300, basePrice: "14.75" })
      .returning();
    await db.insert(mealSizeItems).values([
      { mealSizeId: size!.id, name: "Sabzi NV", category: "sabzi", planId: nonVeg!.id, tuAmount: "1.5", sortOrder: 0 },
      { mealSizeId: size!.id, name: "Daal", category: "daal", planId: veg!.id, tuAmount: "1", sortOrder: 1 },
      { mealSizeId: size!.id, name: "Sabzi V", category: "sabzi", planId: veg!.id, tuAmount: "1", sortOrder: 2 },
      { mealSizeId: size!.id, name: "Salad", category: "salad", planId: veg!.id, tuAmount: "1", sortOrder: 3 },
    ]);
    await db.insert(categoryCostRates).values([
      { category: "sabzi", planId: nonVeg!.id, organizationId: null, costBase: "0", costPerTu: "2" },
      { category: "sabzi", planId: veg!.id, organizationId: null, costBase: "0", costPerTu: "4" },
      { category: "daal", planId: veg!.id, organizationId: null, costBase: "1", costPerTu: "0" },
      { category: "salad", planId: veg!.id, organizationId: null, costBase: "1", costPerTu: "0" },
    ]);
    const [u] = await db.insert(users).values({ email: USER_EMAIL, phone: "+16475557031", role: "user" }).returning();
    const orderValues = (deploymentId: string, mealSizeId: bigint) => ({
      userId: u!.id,
      planId: nonVeg!.id,
      mealSizeId,
      frequencyId: freq!.id,
      persons: 1,
      mealSlots: ["lunch"],
      categoryCounts: {},
      durationWeeks: 1,
      startDate: "2036-03-05",
      tiffinCount: 2,
      perTiffinPrice: "10.00",
      pricingSnapshot: {},
      total: "20.00",
      status: "active" as const,
      deploymentId,
      fullName: "Cost Tester",
      addressLine: "1 Queen St",
      city: "Toronto",
      postalCode: "M5V 2T6",
    });
    const [trip] = await db.insert(orders).values(orderValues("FCS-TRIP", size!.id)).returning();
    const [noItems] = await db.insert(orders).values(orderValues("FCS-EMPTY", empty!.id)).returning();
    // Trip covers two days; the swap sabzi→daal applies only to the second eating day.
    const [tripDelivery] = await db
      .insert(deliveries)
      .values({
        orderId: trip!.id,
        deliveryDate: "2036-03-05",
        coversDates: ["2036-03-05", "2036-03-06"],
        tiffinUnits: 2,
        status: "scheduled",
        optimoCompletionStatus: "success",
        cutoffAt: NOW - 1,
      })
      .returning();
    await db.insert(deliveries).values({
      orderId: noItems!.id,
      deliveryDate: "2036-03-10",
      tiffinUnits: 1,
      status: "scheduled",
      optimoCompletionStatus: "success",
      cutoffAt: NOW - 1,
    });
    await db.insert(deliveryCategorySwaps).values({
      deliveryId: tripDelivery!.id,
      fromCategory: "sabzi",
      toCategory: "daal",
      qtyFrom: 1,
      qtyTo: 1,
      forDate: "2036-03-06",
    });
  });
  afterAll(reset);

  it("sums a trip's eating days onto its delivery date, swaps applied per day", async () => {
    const byDate = await foodCostByDate(scope, FROM, TO);
    // Day 1: sabzi NV 1.5 (3) + daal (1) + sabzi V (4) + salad (1) = 9.
    // Day 2 after the swap: sabzi V (4) + daal row (1) + received daal (1) + salad (1) = 7.
    const day = byDate.get("2036-03-05");
    expect(day?.foodCost).toBeCloseTo(16);
    expect(day?.tiffinsWithoutRate).toBe(0);
    expect(day?.unratedCategories).toEqual([]);
  });

  it("counts a tiffin whose meal size has no items as unrated", async () => {
    const byDate = await foodCostByDate(scope, FROM, TO);
    expect(byDate.get("2036-03-10")).toEqual({ foodCost: 0, tiffinsWithoutRate: 1, unratedCategories: [] });
  });
});
