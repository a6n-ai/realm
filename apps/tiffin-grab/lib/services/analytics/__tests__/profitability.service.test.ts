import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { inArray } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { deliveries, deliveryFrequencies, mealSizes, orders, payments, plans, users } = await import("@/db/schema");
const { ZERO_ASSUMPTIONS } = await import("@/lib/analytics/profitability");
const { getProfitabilityReport } = await import("../profitability.service");
const { setProfitabilityAssumptions } = await import("../../app-settings.service");

const NOW = Date.parse("2036-09-18T16:00:00Z");

const createdUserIds: bigint[] = [];
const createdOrderIds: bigint[] = [];

async function reset() {
  if (createdOrderIds.length) {
    await db.delete(deliveries).where(inArray(deliveries.orderId, createdOrderIds));
    await db.delete(payments).where(inArray(payments.orderId, createdOrderIds));
    await db.delete(orders).where(inArray(orders.id, createdOrderIds));
  }
  if (createdUserIds.length) {
    await db.delete(users).where(inArray(users.id, createdUserIds));
  }
  createdUserIds.length = 0;
  createdOrderIds.length = 0;
  await setProfitabilityAssumptions(ZERO_ASSUMPTIONS);
}

async function makeOrder(over: { total: string; tiffinCount: number; deploymentId: string }) {
  const [[plan], [mealSize], [freq]] = await Promise.all([
    db.select({ id: plans.id }).from(plans).limit(1),
    db.select({ id: mealSizes.id }).from(mealSizes).limit(1),
    db.select({ id: deliveryFrequencies.id }).from(deliveryFrequencies).limit(1),
  ]);
  const [u] = await db.insert(users).values({ email: `${over.deploymentId.toLowerCase()}@x.test`, name: "P" }).returning();
  createdUserIds.push(u!.id);
  const [o] = await db
    .insert(orders)
    .values({
      userId: u!.id,
      planId: plan!.id,
      mealSizeId: mealSize!.id,
      frequencyId: freq!.id,
      durationWeeks: 4,
      startDate: "2035-01-01",
      tiffinCount: over.tiffinCount,
      perTiffinPrice: "10.00",
      pricingSnapshot: {},
      total: over.total,
      deploymentId: over.deploymentId,
      fullName: "Profit Fixture",
      addressLine: "1 St",
      city: "Toronto",
      postalCode: "M5V 2T6",
    })
    .returning();
  createdOrderIds.push(o!.id);
  return o!;
}

async function makeDelivery(orderId: bigint, date: string, over: { status?: "scheduled" | "skipped"; tiffinUnits?: number } = {}) {
  await db.insert(deliveries).values({
    orderId,
    deliveryDate: date,
    status: over.status ?? "scheduled",
    cutoffAt: NOW - 1,
    tiffinUnits: over.tiffinUnits ?? 1,
  });
}

async function makePayment(orderId: bigint, amount: string, capturedAt: number) {
  await db.insert(payments).values({
    orderId,
    status: "paid",
    method: "etransfer",
    amount,
    capturedAt,
  });
}

describe("profitability report", () => {
  beforeEach(reset);
  afterAll(reset);

  it("allocates plan revenue onto delivery dates, not the payment date", async () => {
    // Paid $200 on 2 Jan for 20 tiffins: 10 delivered in January, 10 in February.
    const order = await makeOrder({ total: "200.00", tiffinCount: 20, deploymentId: "PROF-SPLIT" });
    await makePayment(order.id, "200.00", Date.parse("2035-01-02T15:00:00Z"));
    for (let d = 1; d <= 10; d++) {
      await makeDelivery(order.id, `2035-01-${String(d).padStart(2, "0")}`);
    }
    for (let d = 1; d <= 10; d++) {
      await makeDelivery(order.id, `2035-02-${String(d).padStart(2, "0")}`);
    }

    const report = await getProfitabilityReport({ month: "2035-02", grain: "monthly", now: NOW });
    const jan = report.rows.find((r) => r.date === "2035-01");
    const feb = report.rows.find((r) => r.date === "2035-02");

    expect(jan?.revenue).toBe(100);
    expect(jan?.cashCollected).toBe(200);
    expect(jan?.tiffins).toBe(10);

    expect(feb?.revenue).toBe(100);
    expect(feb?.cashCollected).toBe(0);
    expect(feb?.tiffins).toBe(10);
  });

  it("does not earn revenue on skipped days", async () => {
    const order = await makeOrder({ total: "30.00", tiffinCount: 3, deploymentId: "PROF-SKIP" });
    await makeDelivery(order.id, "2035-01-05");
    await makeDelivery(order.id, "2035-01-06", { status: "skipped" });
    await makeDelivery(order.id, "2035-01-07");

    const report = await getProfitabilityReport({ month: "2035-01", grain: "daily", now: NOW });
    const byDate = Object.fromEntries(report.rows.map((r) => [r.date, r]));
    expect(byDate["2035-01-05"]?.revenue).toBe(10);
    expect(byDate["2035-01-06"]?.revenue).toBe(0);
    expect(byDate["2035-01-06"]?.tiffins).toBe(0);
    expect(byDate["2035-01-07"]?.revenue).toBe(10);
    expect(report.kpis.revenue).toBe(20);
  });

  it("charges kitchen/driver against delivered tiffins and still allocates monthly costs on empty days", async () => {
    await setProfitabilityAssumptions({
      ...ZERO_ASSUMPTIONS,
      kitchenCostPerTiffin: 4,
      driverCostPerTiffin: 1,
      marketingMonthly: 310, // January 2026 has 31 days → $10/day
    });
    const order = await makeOrder({ total: "20.00", tiffinCount: 2, deploymentId: "PROF-COST" });
    await makeDelivery(order.id, "2035-01-05", { tiffinUnits: 2 });

    const report = await getProfitabilityReport({ month: "2035-01", grain: "daily", now: NOW });
    const day = report.rows.find((r) => r.date === "2035-01-05");
    expect(day?.kitchen).toBe(8);
    expect(day?.driver).toBe(2);
    expect(day?.marketing).toBe(10);
    expect(day?.profit).toBe(0); // 20 revenue − 8 − 2 − 10

    const empty = report.rows.find((r) => r.date === "2035-01-06");
    expect(empty?.tiffins).toBe(0);
    expect(empty?.marketing).toBe(10);
    expect(empty?.profit).toBe(-10);
  });
});
