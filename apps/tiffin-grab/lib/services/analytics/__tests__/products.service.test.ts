import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
vi.mock("@/lib/auth/session", () => ({ getSession: async () => null }));

const { db } = await import("@/db/client");
const { dishCategories, dishes, deliveryFrequencies, mealSelections, mealSizes, menuWeeks, orders, payments, plans, users } =
  await import("@/db/schema");
const { buildAnalyticsScope } = await import("../metrics/scope");
const { revenueTotals } = await import("../metrics/money");
const { getPaidByMealType, getPaidByPlan, getPaidByTier, getProductStats, getTopDishes } = await import("../products.service");

const TZ = "America/Toronto";
const now = Date.now();
const scope = buildAnalyticsScope({ from: String(now - 86_400_000), to: String(now + 86_400_000) }, "all", TZ, now);

const orderIds: bigint[] = [];
const userIds: bigint[] = [];
let dishId = 0n;
let weekId = 0n;

async function makeOrder(over: { planIdx: number; status?: "active" | "cancelled"; paid?: string; deploymentId: string }) {
  const planRows = await db.select({ id: plans.id }).from(plans).orderBy(plans.id);
  const [size] = await db.select({ id: mealSizes.id }).from(mealSizes).where(eq(mealSizes.custom, false)).limit(1);
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
  if (over.paid) await db.insert(payments).values({ orderId: o!.id, status: "paid", method: "etransfer", amount: over.paid, capturedAt: now });
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

    const [net, byPlan, byTier, byMeal] = await Promise.all([
      revenueTotals(scope),
      getPaidByPlan(scope),
      getPaidByTier(scope),
      getPaidByMealType(scope),
    ]);
    const sum = (rows: { paid: number }[]) => Math.round(rows.reduce((s, r) => s + r.paid, 0) * 100) / 100;
    expect(net.net).toBe(150); // 100 + 50, ex tax
    expect(sum(byPlan)).toBe(net.net);
    // Both fixture orders use one catalog meal size, so the two size splits carry all of it too.
    expect(sum(byMeal)).toBe(net.net);
    expect(sum(byTier)).toBe(net.net);
  });

  it("dish counts leave out cancelled orders nobody paid for", async () => {
    await cleanOrders();
    await makeOrder({ planIdx: 0, paid: "113.00", deploymentId: "PRD-C" });
    await makeOrder({ planIdx: 0, status: "cancelled", deploymentId: "PRD-D" }); // never paid, never ran
    await makeOrder({ planIdx: 0, status: "cancelled", paid: "113.00", deploymentId: "PRD-E" }); // paid, kept

    const stats = await getProductStats(scope);
    expect(stats.totalSelections).toBe(2);
    const top = await getTopDishes(5, scope);
    expect(top.find((d) => d.dish.startsWith("Fixture dish"))?.n).toBe(2);
  });

  it("is empty for a scope with no franchise", async () => {
    const none = { ...scope, orgIds: [] as string[] };
    expect(await getProductStats(none)).toEqual({ totalSelections: 0, distinctDishes: 0, topDish: null });
    expect(await getPaidByPlan(none)).toEqual([]);
  });
});
