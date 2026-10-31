import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { deliveries, deliveryFrequencies, ledgerEntries, mealSizes, orders, payments, plans, users } = await import("@/db/schema");
const { ZERO_ASSUMPTIONS } = await import("@/lib/analytics/profitability");
const { getProfitabilityReport } = await import("../profitability.service");
const { setProfitabilityAssumptions } = await import("../../app-settings.service");
const { buildAnalyticsScope } = await import("../metrics/scope");
const { revenueTotals } = await import("../metrics/money");
const { getRevenueReport } = await import("../revenue.service");
const { zonedRangeMs } = await import("@/lib/analytics/drill");

const NOW = Date.parse("2036-09-18T16:00:00Z");
const TZ = "America/Toronto";
const scopeFor = (from: string, to: string) => {
  const r = zonedRangeMs(from, to, TZ);
  return buildAnalyticsScope({ from: String(r.from), to: String(r.to) }, "all", TZ, NOW);
};
// The same ranges the old month/grain nav produced for these fixtures.
const JAN_2035 = scopeFor("2035-01-01", "2035-01-31");
const YEAR_TO_FEB_2035 = scopeFor("2034-03-01", "2035-02-28");


const createdUserIds: bigint[] = [];
const createdOrderIds: bigint[] = [];

async function reset() {
  if (createdOrderIds.length) {
    await db.delete(deliveries).where(inArray(deliveries.orderId, createdOrderIds));
    await db.delete(ledgerEntries).where(inArray(ledgerEntries.orderId, createdOrderIds));
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

async function makeOrder(over: { total: string; tiffinCount: number; deploymentId: string; taxTotal?: number; snapshot?: Record<string, unknown> }) {
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
      // Revenue reads the quote the payment settled: total and tax from the snapshot.
      pricingSnapshot: { total: Number(over.total), taxTotal: over.taxTotal ?? 0, ...over.snapshot },
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
    // Delivered means confirmed (OptimoRoute or an admin); a passed cutoff alone earns nothing.
    optimoCompletionStatus: (over.status ?? "scheduled") === "scheduled" ? "success" : null,
  });
}

async function makePayment(
  orderId: bigint,
  amount: string,
  capturedAt: number,
  status: "paid" | "refunded" | "awaiting_payment" = "paid",
) {
  const [p] = await db.insert(payments).values({
    orderId,
    status,
    method: "etransfer",
    amount,
    capturedAt,
  }).returning();
  return p!;
}

async function makeRefund(orderId: bigint, paymentId: bigint, amount: string, createdAt: number) {
  const [{ userId }] = await db.select({ userId: orders.userId }).from(orders).where(eq(orders.id, orderId));
  await db.insert(ledgerEntries).values({ userId: userId!, orderId, paymentId, direction: "debit", type: "refund", amount, createdAt });
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

    const report = await getProfitabilityReport({ month: "2035-02", grain: "monthly", now: NOW, scope: YEAR_TO_FEB_2035 });
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
    await makePayment(order.id, "30.00", Date.parse("2034-12-20T15:00:00Z"));
    await makeDelivery(order.id, "2035-01-05");
    await makeDelivery(order.id, "2035-01-06", { status: "skipped" });
    await makeDelivery(order.id, "2035-01-07");

    const report = await getProfitabilityReport({ month: "2035-01", grain: "daily", now: NOW, scope: JAN_2035 });
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
    await makePayment(order.id, "20.00", Date.parse("2034-12-20T15:00:00Z"));
    await makeDelivery(order.id, "2035-01-05", { tiffinUnits: 2 });

    const report = await getProfitabilityReport({ month: "2035-01", grain: "daily", now: NOW, scope: JAN_2035 });
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

  it("earns revenue net of tax", async () => {
    // $113 paid = $100 plan + $13 HST, over 10 tiffins → $10 earned per tiffin.
    const order = await makeOrder({ total: "113.00", tiffinCount: 10, deploymentId: "PROF-TAX", taxTotal: 13 });
    await makePayment(order.id, "113.00", Date.parse("2035-01-02T15:00:00Z"));
    await makeDelivery(order.id, "2035-01-05");

    const report = await getProfitabilityReport({ month: "2035-01", grain: "daily", now: NOW, scope: JAN_2035 });
    expect(report.rows.find((r) => r.date === "2035-01-05")?.revenue).toBe(10);
    expect(report.kpis.cashCollected).toBe(113);
  });

  it("holds unpaid orders out of revenue but still charges their tiffin costs", async () => {
    await setProfitabilityAssumptions({ ...ZERO_ASSUMPTIONS, kitchenCostPerTiffin: 4 });
    const order = await makeOrder({ total: "50.00", tiffinCount: 5, deploymentId: "PROF-UNPAID" });
    await makePayment(order.id, "50.00", Date.parse("2035-01-02T15:00:00Z"), "awaiting_payment");
    await makeDelivery(order.id, "2035-01-05");

    const report = await getProfitabilityReport({ month: "2035-01", grain: "daily", now: NOW, scope: JAN_2035 });
    const day = report.rows.find((r) => r.date === "2035-01-05");
    expect(day?.revenue).toBe(0);
    expect(day?.unpaidRevenue).toBe(10);
    expect(day?.kitchen).toBe(4);
    expect(report.kpis.unpaidRevenue).toBe(10);
  });

  it("earns nothing on a refunded order", async () => {
    const order = await makeOrder({ total: "50.00", tiffinCount: 5, deploymentId: "PROF-REFUND" });
    const paid = await makePayment(order.id, "50.00", Date.parse("2035-01-02T15:00:00Z"), "refunded");
    await makeRefund(order.id, paid.id, "50.00", Date.parse("2035-01-03T15:00:00Z"));
    await makeDelivery(order.id, "2035-01-05");

    const report = await getProfitabilityReport({ month: "2035-01", grain: "daily", now: NOW, scope: JAN_2035 });
    const day = report.rows.find((r) => r.date === "2035-01-05");
    expect(day?.revenue).toBe(0);
    expect(day?.unpaidRevenue).toBe(0);
    expect(day?.tiffins).toBe(1);
  });

  it("reports the next cutoff so the page can refresh when it passes", async () => {
    const order = await makeOrder({ total: "20.00", tiffinCount: 2, deploymentId: "PROF-NEXT" });
    await db.insert(deliveries).values({
      orderId: order.id,
      deliveryDate: "2035-01-20",
      status: "scheduled",
      cutoffAt: NOW + 60_000,
      tiffinUnits: 1,
    });

    const report = await getProfitabilityReport({ month: "2035-01", grain: "daily", now: NOW, scope: JAN_2035 });
    expect(report.nextCutoffAt).toBe(NOW + 60_000);
    expect(report.rows.find((r) => r.date === "2035-01-20")?.tiffins).toBe(0);
  });

  it("earns revenue the moment OptimoRoute confirms delivery, before cutoff", async () => {
    const order = await makeOrder({ total: "10.00", tiffinCount: 1, deploymentId: "PROF-EARLY" });
    await makePayment(order.id, "10.00", Date.parse("2035-01-02T15:00:00Z"));
    await db.insert(deliveries).values({
      orderId: order.id,
      deliveryDate: "2035-01-20",
      status: "scheduled",
      cutoffAt: NOW + 60_000,
      tiffinUnits: 1,
      optimoCompletionStatus: "success",
    });

    const report = await getProfitabilityReport({ month: "2035-01", grain: "daily", now: NOW, scope: JAN_2035 });
    const day = report.rows.find((r) => r.date === "2035-01-20");
    expect(day?.tiffins).toBe(1);
    expect(day?.revenue).toBe(10);
    expect(report.nextCutoffAt).toBeNull();
  });

  it("earns the paid share of a partly paid order (ex tax), not the whole order total", async () => {
    // $113 order ($100 + $13 HST) over 10 tiffins, only half paid: $56.50 paid = $50 ex tax = $5 per tiffin.
    const order = await makeOrder({ total: "113.00", tiffinCount: 10, deploymentId: "PROF-PART", taxTotal: 13 });
    await makePayment(order.id, "56.50", Date.parse("2035-01-02T15:00:00Z"));
    for (const d of [5, 6, 7, 8]) await makeDelivery(order.id, `2035-01-0${d}`);

    const report = await getProfitabilityReport({ month: "2035-01", grain: "daily", now: NOW, scope: JAN_2035 });
    expect(report.kpis.revenue).toBe(20);
    expect(report.kpis.unpaidRevenue).toBe(20); // the other half, ex tax
  });

  it("takes refunds off the order's earned revenue ex tax", async () => {
    // Paid $113 ($100 + $13 HST), $56.50 refunded: 56.50 of 113 is half, so $50 ex tax stays, $5 per tiffin.
    const order = await makeOrder({ total: "113.00", tiffinCount: 10, deploymentId: "PROF-PREF", taxTotal: 13 });
    const paid = await makePayment(order.id, "113.00", Date.parse("2035-01-02T15:00:00Z"));
    await makeRefund(order.id, paid.id, "56.50", Date.parse("2035-01-03T15:00:00Z"));
    await makeDelivery(order.id, "2035-01-05");
    await makeDelivery(order.id, "2035-01-06");

    const report = await getProfitabilityReport({ month: "2035-01", grain: "daily", now: NOW, scope: JAN_2035 });
    expect(report.kpis.revenue).toBe(10);
  });

  it("Cash collected equals the Revenue tab's Net collected for the same scope", async () => {
    const a = await makeOrder({ total: "113.00", tiffinCount: 10, deploymentId: "PROF-CASHA", taxTotal: 13 });
    const paidA = await makePayment(a.id, "113.00", Date.parse("2035-01-02T15:00:00Z"));
    await makeRefund(a.id, paidA.id, "56.50", Date.parse("2035-01-09T15:00:00Z"));
    const b = await makeOrder({ total: "100.00", tiffinCount: 10, deploymentId: "PROF-CASHB" });
    await makePayment(b.id, "40.00", Date.parse("2035-01-31T03:00:00Z")); // Jan 30 evening in Toronto, Jan 31 in UTC
    await makeDelivery(a.id, "2035-01-05");

    const report = await getProfitabilityReport({ month: "2035-01", grain: "daily", now: NOW, scope: JAN_2035 });
    const revenue = (await getRevenueReport(JAN_2035)).kpis;
    const totals = await revenueTotals(JAN_2035);
    expect(report.kpis.cashCollected).toBe(revenue.netCollected);
    expect(report.kpis.cashCollected).toBe(96.5); // 113 + 40 - 56.50
    expect(report.kpis.cashCollected).toBe(totals.gross - totals.refundsExSurcharge);
    expect(report.rows.find((r) => r.date === "2035-01-30")?.cashCollected).toBe(40);
  });

  it("reports nothing when the scope has no franchise", async () => {
    const order = await makeOrder({ total: "20.00", tiffinCount: 2, deploymentId: "PROF-NONE" });
    await makePayment(order.id, "20.00", Date.parse("2035-01-02T15:00:00Z"));
    await makeDelivery(order.id, "2035-01-05");
    const none = { ...JAN_2035, orgIds: [] as string[] };
    const report = await getProfitabilityReport({ month: "2035-01", grain: "daily", now: NOW, scope: none });
    expect(report.kpis.tiffins).toBe(0);
    expect(report.kpis.cashCollected).toBe(0);
  });

  it("a refunded payment with no ledger refund row still earns its net ex tax (legacy rule, as on the Revenue tab)", async () => {
    const order = await makeOrder({ total: "113.00", tiffinCount: 10, deploymentId: "PROF-LEGACY", taxTotal: 13 });
    await makePayment(order.id, "113.00", Date.parse("2035-01-02T15:00:00Z"), "refunded");
    await makeDelivery(order.id, "2035-01-05");

    const report = await getProfitabilityReport({ month: "2035-01", grain: "daily", now: NOW, scope: JAN_2035 });
    expect(report.kpis.revenue).toBe(10);
    expect((await getRevenueReport(JAN_2035)).kpis.netRevenue).toBe(100); // same order, whole
  });

  it("reports the unpaid remainder of a half-paid order", async () => {
    // $100 order, 10 tiffins, $40 paid: $4 earned and $6 still owed per tiffin.
    const order = await makeOrder({ total: "100.00", tiffinCount: 10, deploymentId: "PROF-HALF" });
    await makePayment(order.id, "40.00", Date.parse("2035-01-02T15:00:00Z"));
    await makeDelivery(order.id, "2035-01-05");
    await makeDelivery(order.id, "2035-01-06");

    const report = await getProfitabilityReport({ month: "2035-01", grain: "daily", now: NOW, scope: JAN_2035 });
    expect(report.kpis.revenue).toBe(8);
    expect(report.kpis.unpaidRevenue).toBe(12);
  });

  it("leaves WP-migrated tiffins out of revenue and per-tiffin costs, but not the monthly costs", async () => {
    await setProfitabilityAssumptions({ ...ZERO_ASSUMPTIONS, kitchenCostPerTiffin: 4, otherCostPerTiffin: 1, marketingMonthly: 310 });
    const normal = await makeOrder({ total: "20.00", tiffinCount: 2, deploymentId: "PROF-NORM" });
    await makePayment(normal.id, "20.00", Date.parse("2034-12-20T15:00:00Z"));
    await makeDelivery(normal.id, "2035-01-05", { tiffinUnits: 2 });
    const wp = await makeOrder({
      total: "0.00",
      tiffinCount: 5,
      deploymentId: "PROF-WP",
      snapshot: { wordpress: { orderId: 1, mergedOrderIds: [], lastDeliveredDate: null, deliveredCount: 0, refreshedOn: "2035-01-01" } },
    });
    await makeDelivery(wp.id, "2035-01-05", { tiffinUnits: 3 });
    await makeDelivery(wp.id, "2035-01-06", { tiffinUnits: 1 });

    const report = await getProfitabilityReport({ month: "2035-01", grain: "daily", now: NOW, scope: JAN_2035 });
    const day = report.rows.find((r) => r.date === "2035-01-05");
    expect(day?.tiffins).toBe(2);
    expect(day?.revenue).toBe(20);
    expect(day?.kitchen).toBe(8);
    expect(day?.other).toBe(2);
    expect(day?.marketing).toBe(10);
    expect(report.rows.find((r) => r.date === "2035-01-06")?.tiffins).toBe(0);
    expect(report.rows.find((r) => r.date === "2035-01-06")?.marketing).toBe(10);
    expect(report.kpis.tiffins).toBe(2);
    expect(report.migratedTiffinsExcluded).toBe(4);
  });

  it("splits total costs by kind", async () => {
    await setProfitabilityAssumptions({ ...ZERO_ASSUMPTIONS, kitchenCostPerTiffin: 4, otherCostPerTiffin: 1, otherMonthly: 310 });
    const order = await makeOrder({ total: "20.00", tiffinCount: 2, deploymentId: "PROF-KIND" });
    await makePayment(order.id, "20.00", Date.parse("2034-12-20T15:00:00Z"));
    await makeDelivery(order.id, "2035-01-05", { tiffinUnits: 2 });
    const report = await getProfitabilityReport({ month: "2035-01", grain: "daily", now: NOW, scope: JAN_2035 });
    const parts = Object.fromEntries(report.costParts.map((p) => [p.label, p.value]));
    expect(parts["Kitchen"]).toBe(8);
    expect(parts["Other per tiffin"]).toBe(2);
    expect(parts["Other monthly"]).toBe(310);
  });
});
