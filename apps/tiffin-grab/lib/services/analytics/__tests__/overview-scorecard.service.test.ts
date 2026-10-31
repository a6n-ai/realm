import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { inArray } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
vi.mock("@/lib/auth/session", () => ({ getSession: async () => null }));

const { db } = await import("@/db/client");
const { deliveries, deliveryFrequencies, mealSizes, orders, organization, payments, plans, tickets, users } = await import("@/db/schema");
const { buildAnalyticsScope } = await import("../metrics/scope");
const { getDailyScorecard } = await import("../overview.service");
const { getRevenueReport } = await import("../revenue.service");
const { countOrders } = await import("../metrics/orders");
const { getOperationsStats } = await import("../operations.service");
const { getSignupTrend } = await import("../customers.service");
const { getComplaintKpis } = await import("../complaints.service");

const TZ = "America/Toronto";
const DAY = 86_400_000;
const now = Date.now();
const suffix = Math.random().toString(36).slice(2);
const scope = (orgIds: "all" | string[]) =>
  buildAnalyticsScope({ from: String(now - 2 * DAY), to: String(now + 2 * DAY) }, orgIds, TZ, now);

let org = "";
const userIds: bigint[] = [];
const orderIds: bigint[] = [];
const ticketIds: bigint[] = [];
let n = 0;

async function makeUser() {
  const [u] = await db.insert(users).values({ email: `sc${n++}-${suffix}@x.test`, name: "Sc", role: "user" }).returning();
  userIds.push(u!.id);
  return u!.id;
}

async function makeOrder() {
  const [plan] = await db.select({ id: plans.id }).from(plans).limit(1);
  const [size] = await db.select({ id: mealSizes.id }).from(mealSizes).limit(1);
  const [freq] = await db.select({ id: deliveryFrequencies.id }).from(deliveryFrequencies).limit(1);
  const [o] = await db
    .insert(orders)
    .values({
      userId: await makeUser(), planId: plan!.id, mealSizeId: size!.id, frequencyId: freq!.id, durationWeeks: 1,
      startDate: "2035-01-01", tiffinCount: 5, perTiffinPrice: "10.00", pricingSnapshot: { total: 50, taxTotal: 0 }, total: "50.00",
      deploymentId: `SCD-${suffix}-${n++}`, fullName: "Fixture", addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6",
      organizationId: org,
    })
    .returning();
  orderIds.push(o!.id);
  return o!;
}

describe("daily scorecard (integration)", () => {
  beforeAll(async () => {
    [{ id: org }] = await db.insert(organization).values({ name: "Scorecard", clientCode: `SCD-${suffix}` }).returning({ id: organization.id });
  });

  afterAll(async () => {
    if (ticketIds.length) await db.delete(tickets).where(inArray(tickets.id, ticketIds));
    if (orderIds.length) {
      await db.delete(deliveries).where(inArray(deliveries.orderId, orderIds));
      await db.delete(payments).where(inArray(payments.orderId, orderIds));
      await db.delete(orders).where(inArray(orders.id, orderIds));
    }
    await db.delete(users).where(inArray(users.id, userIds));
    await db.delete(organization).where(inArray(organization.id, [org]));
  });

  it("every column totals to the matching tab figure, newest day first", async () => {
    const a = await makeOrder();
    const b = await makeOrder();
    const today = new Date(now).toISOString().slice(0, 10);
    const yesterday = new Date(now - DAY).toISOString().slice(0, 10);
    const tomorrow = new Date(now + DAY).toISOString().slice(0, 10);
    for (const [o, status, date] of [[a, "scheduled", today], [a, "skipped", yesterday], [b, "cancelled", today], [b, "scheduled", tomorrow]] as const) {
      await db.insert(deliveries).values({ orderId: o.id, deliveryDate: date, status, cutoffAt: now, tiffinUnits: 1 });
    }
    await db.insert(payments).values({ orderId: a.id, amount: "50.00", status: "paid", method: "stripe", capturedAt: now } as never);
    await db.insert(payments).values({ orderId: b.id, amount: "30.00", status: "paid", method: "stripe", capturedAt: now - DAY } as never);
    const raisedBy = await makeUser();
    for (const createdAt of [now, now - DAY]) {
      const [t] = await db
        .insert(tickets)
        .values({ raisedBy, subject: "t", category: "order", status: "open", orderId: a.id, createdAt })
        .returning({ id: tickets.id });
      ticketIds.push(t!.id);
    }

    const sc = scope([org]);
    const rows = await getDailyScorecard(sc);
    const sum = (k: "revenue" | "orders" | "deliveries" | "skipped" | "signups" | "complaints") => rows.reduce((t, r) => t + r[k], 0);
    const [report, orderCount, ops, signups, complaints] = await Promise.all([
      getRevenueReport(sc),
      countOrders(sc),
      getOperationsStats(sc),
      getSignupTrend(sc),
      getComplaintKpis(sc),
    ]);

    expect(sum("revenue")).toBeCloseTo(report.kpis.netRevenue, 2);
    expect(sum("revenue")).toBeGreaterThan(0);
    expect(sum("orders")).toBe(orderCount);
    expect(sum("orders")).toBe(2);
    expect(sum("deliveries")).toBe(ops.totalDeliveries);
    expect(sum("deliveries")).toBe(4);
    expect(sum("skipped")).toBe(ops.skipped);
    expect(sum("signups")).toBe(signups.reduce((t, r) => t + r.n, 0));
    expect(sum("signups")).toBeGreaterThan(0);
    expect(sum("complaints")).toBe(complaints.total);
    expect(sum("complaints")).toBe(2);

    expect(rows.map((r) => r.date)).toEqual([...rows.map((r) => r.date)].sort().reverse());
    expect(rows.every((r) => r.profit === null)).toBe(true);
    const row = rows.find((r) => r.date === today)!;
    expect(row.href).toMatch(/^\/dashboard\/orders\?/);
    expect(row.href).toContain("view=all");
  });

  it("is empty for a franchise with no access", async () => {
    const rows = await getDailyScorecard(scope([]));
    expect(rows.every((r) => r.revenue === 0 && r.orders === 0 && r.deliveries === 0 && r.signups === 0 && r.complaints === 0)).toBe(true);
  });
});
