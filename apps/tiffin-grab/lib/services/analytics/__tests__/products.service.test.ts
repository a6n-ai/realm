import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
vi.mock("@/lib/auth/session", () => ({ getSession: async () => null }));

const { db } = await import("@/db/client");
const { deliveries, dishCategories, dishes, deliveryFrequencies, mealSelections, mealSizes, menuWeeks, orders, payments, plans, users } =
  await import("@/db/schema");
const { buildAnalyticsScope } = await import("../metrics/scope");
const { revenueBy, revenueTotals } = await import("../metrics/money");
const { getPaidByTierAndDiet, getPaidByMealType, getPaidByTier, getProductStats, getTopDishes, getSizeSales, picksByCategory, tiffinsBySize, getPickers } =
  await import("../products.service");
const { getDeliveryStatusMix } = await import("../operations.service");
const { buildSizeTreemap, treemapTotal } = await import("@/lib/analytics/size-treemap");
const { isoDateInZone } = await import("@/lib/analytics/profitability");

const TZ = "America/Toronto";
const now = Date.now();
const scope = buildAnalyticsScope({ from: String(now - 86_400_000), to: String(now + 86_400_000) }, "all", TZ, now);

// Payments are captured in a window no other test-DB row touches, so the money split is exact.
const PAID_AT = now + 400 * 86_400_000;
const payScope = buildAnalyticsScope({ from: String(PAID_AT - 1000), to: String(PAID_AT + 1000) }, "all", TZ, now);

const orderIds: bigint[] = [];
const userIds: bigint[] = [];
let dishId = 0n;
let weekId = 0n;

async function makeOrder(over: { planIdx: number; status?: "active" | "cancelled"; paid?: string; deploymentId: string }) {
  const planRows = await db.select({ id: plans.id }).from(plans).orderBy(plans.id);
  const planId = planRows[Math.min(over.planIdx, planRows.length - 1)]!.id;
  const [own] = await db.select({ id: mealSizes.id }).from(mealSizes).where(and(eq(mealSizes.custom, false), eq(mealSizes.planId, planId))).limit(1);
  const [size] = own ? [own] : await db.select({ id: mealSizes.id }).from(mealSizes).where(eq(mealSizes.custom, false)).limit(1);
  const [freq] = await db.select({ id: deliveryFrequencies.id }).from(deliveryFrequencies).limit(1);
  const [u] = await db.insert(users).values({ email: `${over.deploymentId.toLowerCase()}@x.test`, name: "Prod" }).returning();
  userIds.push(u!.id);
  const [o] = await db
    .insert(orders)
    .values({
      userId: u!.id,
      planId: planRows[Math.min(over.planIdx, planRows.length - 1)]!.id,
      mealSizeId: size!.id,
      frequencyId: freq!.id,
      durationWeeks: 1,
      startDate: "2035-01-01",
      tiffinCount: 5,
      perTiffinPrice: "20.00",
      pricingSnapshot: { total: 113, taxTotal: 13 },
      total: "113.00",
      status: over.status ?? "active",
      deploymentId: over.deploymentId,
      fullName: "Fixture",
      addressLine: "1 St",
      city: "Toronto",
      postalCode: "M5V 2T6",
    })
    .returning();
  orderIds.push(o!.id);
  if (over.paid) await db.insert(payments).values({ orderId: o!.id, status: "paid", method: "etransfer", amount: over.paid, capturedAt: PAID_AT });
  await db.insert(mealSelections).values({
    orderId: o!.id, menuWeekId: weekId, dayOfWeek: "mon", categoryId: (await db.select({ id: dishCategories.id }).from(dishCategories).limit(1))[0]!.id,
    personIndex: 1, dishId,
  });
  return o!;
}

async function cleanOrders() {
  if (orderIds.length) {
    await db.delete(mealSelections).where(inArray(mealSelections.orderId, orderIds));
    await db.delete(payments).where(inArray(payments.orderId, orderIds));
    await db.delete(orders).where(inArray(orders.id, orderIds));
  }
  if (userIds.length) await db.delete(users).where(inArray(users.id, userIds));
  orderIds.length = 0;
  userIds.length = 0;
}

async function cleanup() {
  await cleanOrders();
  await db.delete(menuWeeks).where(eq(menuWeeks.weekStart, "2037-01-05"));
  if (dishId) await db.delete(dishes).where(eq(dishes.id, dishId));
}

describe("products analytics", () => {
  beforeAll(async () => {
    const [plan] = await db.select({ id: plans.id }).from(plans).limit(1);
    [{ id: dishId }] = await db.insert(dishes).values({ name: `Fixture dish ${now}`, planId: plan!.id }).returning({ id: dishes.id });
    [{ id: weekId }] = await db.insert(menuWeeks).values({ weekStart: "2037-01-05", orderCutoff: now }).returning({ id: menuWeeks.id });
  });
  afterAll(cleanup);

  it("paid by plan, tier and meal type are the Revenue tab's net", async () => {
    await makeOrder({ planIdx: 0, paid: "113.00", deploymentId: "PRD-A" });
    await makeOrder({ planIdx: 1, paid: "56.50", deploymentId: "PRD-B" });

    const [net, planBuckets, planRows, byTier, byMeal] = await Promise.all([
      revenueTotals(payScope),
      revenueBy(payScope, "plan"),
      db.select({ key: plans.key, name: plans.name }).from(plans),
      getPaidByTier(payScope),
      getPaidByMealType(payScope),
    ]);
    const sum = (rows: { paid: number }[]) => Math.round(rows.reduce((s, r) => s + r.paid, 0) * 100) / 100;
    expect(net.net).toBe(150); // 100 + 50, ex tax
    const planNames = new Map(planRows.map((p) => [p.key, p.name]));
    const byPlan = planBuckets.map((b) => ({ plan: planNames.get(b.key) ?? b.key, paid: b.net }));
    expect(sum(byPlan)).toBe(net.net);
    // Both fixture orders use one catalog meal size, so the two size splits carry all of it too.
    expect(sum(byMeal)).toBe(net.net);
    expect(sum(byTier)).toBe(net.net);
    const byDiet = await getPaidByTierAndDiet(payScope);
    expect(sum(byDiet)).toBe(net.net);
    // Each diet's money is that plan's money: a wrong diet attribution moves cash between them.
    for (const p of byPlan) {
      const diet = byDiet.filter((r) => r.diet === p.plan);
      if (diet.length) expect(sum(diet)).toBe(p.paid);
    }
  });

  it("dish counts leave out cancelled orders nobody paid for", async () => {
    await cleanOrders();
    await makeOrder({ planIdx: 0, paid: "113.00", deploymentId: "PRD-C" });
    await makeOrder({ planIdx: 0, status: "cancelled", deploymentId: "PRD-D" }); // never paid, never ran
    await makeOrder({ planIdx: 0, status: "cancelled", paid: "113.00", deploymentId: "PRD-E" }); // paid, kept

    const stats = await getProductStats(scope);
    expect(stats.totalSelections).toBe(2);
    expect(stats.ordersWithPicks).toBe(2);
    const top = await getTopDishes(5, scope);
    expect(top.find((d) => d.dish.startsWith("Fixture dish"))?.n).toBe(2);
  });

  it("size treemap, tiffins and category picks tie back to the other tabs", async () => {
    await cleanOrders();
    const a = await makeOrder({ planIdx: 0, paid: "113.00", deploymentId: "PRD-F" });
    const b = await makeOrder({ planIdx: 1, paid: "56.50", deploymentId: "PRD-G" });
    const day = isoDateInZone(now, TZ);
    for (const o of [a, b]) {
      await db.insert(deliveries).values({ orderId: o.id, deliveryDate: day, cutoffAt: now, status: "scheduled", tiffinUnits: 1 });
    }

    const sales = await getSizeSales(payScope);
    const net = (await revenueTotals(payScope)).net;
    const order = () => 0;
    expect(treemapTotal(buildSizeTreemap(sales, "revenue", order))).toBeCloseTo(net, 2);

    const bySize = await tiffinsBySize(scope);
    const delivered = bySize.reduce((s, r) => s + r.tiffins, 0);
    const scheduled = (await getDeliveryStatusMix(scope)).find((r) => r.key === "scheduled")?.n ?? 0;
    expect(delivered).toBe(scheduled);
    expect(treemapTotal(buildSizeTreemap(await getSizeSales(scope), "tiffins", order))).toBe(delivered);

    const picks = (await picksByCategory(scope)).reduce((s, r) => s + r.n, 0);
    expect(picks).toBe((await getProductStats(scope)).totalSelections);

    const { pickers, customers } = await getPickers(scope);
    expect(pickers).toBeGreaterThanOrEqual(2);
    expect(customers).toBeGreaterThanOrEqual(2);
  });

  it("is empty for a scope with no franchise", async () => {
    const none = { ...scope, orgIds: [] as string[] };
    expect(await getProductStats(none)).toEqual({ totalSelections: 0, distinctDishes: 0, ordersWithPicks: 0, topDish: null });
  });
});
