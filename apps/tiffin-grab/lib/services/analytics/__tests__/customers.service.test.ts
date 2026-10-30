import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, ne } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
vi.mock("@/lib/auth/session", () => ({ getSession: async () => null }));

const { db } = await import("@/db/client");
const { deliveries, deliveryFrequencies, mealSizes, orders, plans, users } = await import("@/db/schema");
const { getCustomerStats, getSignupTrend, getSubscriptionMix, getTopCities } = await import("../customers.service");
const { buildAnalyticsScope } = await import("../metrics/scope");

const TZ = "America/Toronto";
const at = (iso: string) => Date.parse(iso);
// Mid-April 2026 in Toronto; the range under test is April.
const NOW = at("2026-04-15T16:00:00Z");
const scope = (over: Partial<ReturnType<typeof buildAnalyticsScope>> = {}) => ({
  ...buildAnalyticsScope({}, "all", TZ, NOW),
  ...over,
});

async function reset() {
  await db.delete(deliveries);
  await db.delete(orders);
  await db.delete(users).where(ne(users.isSystem, true));
}

let n = 0;
async function makeUser(city?: string, createdAt?: number) {
  const k = n++;
  const [u] = await db
    .insert(users)
    .values({ email: `cust${k}-${Math.random().toString(36).slice(2)}@x.test`, name: `c${k}`, role: "user", city, ...(createdAt ? { createdAt } : {}) })
    .returning();
  return u!;
}

async function makeOrder(
  userId: bigint,
  over: { status?: string; createdAt?: number; startDate?: string; lastDelivery?: string; pausedOn?: string } = {},
) {
  const [[plan], [mealSize], [freq]] = await Promise.all([
    db.select({ id: plans.id }).from(plans).limit(1),
    db.select({ id: mealSizes.id }).from(mealSizes).limit(1),
    db.select({ id: deliveryFrequencies.id }).from(deliveryFrequencies).limit(1),
  ]);
  const [o] = await db
    .insert(orders)
    .values({
      userId,
      planId: plan!.id,
      mealSizeId: mealSize!.id,
      frequencyId: freq!.id,
      durationWeeks: 1,
      startDate: over.startDate ?? "2026-04-06",
      tiffinCount: 5,
      perTiffinPrice: "10.00",
      pricingSnapshot: {},
      total: "50.00",
      status: (over.status ?? "active") as never,
      createdAt: over.createdAt ?? at("2026-04-05T15:00:00Z"),
      deploymentId: `SUB-T${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      fullName: "Fixture",
      addressLine: "1 St",
      city: "Toronto",
      postalCode: "M5V 2T6",
    })
    .returning();
  const day = (date: string, status: "scheduled" | "paused") =>
    db.insert(deliveries).values({ orderId: o!.id, deliveryDate: date, status, cutoffAt: NOW, tiffinUnits: 1 });
  if (over.lastDelivery) await day(over.lastDelivery, "scheduled");
  if (over.pausedOn) await day(over.pausedOn, "paused");
  return o!;
}

describe("customer analytics", () => {
  beforeEach(reset);
  afterAll(reset);

  it("counts a customer with two orders once", async () => {
    const u = await makeUser();
    await makeOrder(u.id, { lastDelivery: "2026-04-20" });
    await makeOrder(u.id, { lastDelivery: "2026-04-21" });
    const s = await getCustomerStats(scope(), NOW);
    expect(s.customers).toBe(1);
    expect(s.activeCustomers).toBe(1);
  });

  it("applies the date range to every tile", async () => {
    const inRange = await makeUser();
    const old = await makeUser();
    const runningFromBefore = await makeUser();
    const finishedBefore = await makeUser();
    await makeOrder(inRange.id, { status: "cancelled" });
    await makeOrder(old.id, { status: "cancelled", createdAt: at("2026-02-05T15:00:00Z"), startDate: "2026-02-09", lastDelivery: "2026-02-13" });
    // Created in March but still delivering in April: active in range, not a customer of the range.
    await makeOrder(runningFromBefore.id, { createdAt: at("2026-03-28T15:00:00Z"), startDate: "2026-03-30", lastDelivery: "2026-04-17" });
    await makeOrder(finishedBefore.id, { createdAt: at("2026-03-01T15:00:00Z"), startDate: "2026-03-02", lastDelivery: "2026-03-06" });
    const s = await getCustomerStats(scope(), NOW);
    expect(s).toMatchObject({ customers: 1, cancelledOrders: 1, activeCustomers: 1 });
    const { listOrdersPage } = await import("@/lib/services/orders.service");
    const { scopeToOrdersCondition } = await import("../metrics/orders");
    const listed = await listOrdersPage(scopeToOrdersCondition(scope(), { status: ["cancelled"] }), { page: 1, pageSize: 10 } as never, undefined, "all");
    expect(s.cancelledOrders).toBe(listed.total);
    // Narrow the range to a day after everything has finished.
    const day = at("2026-04-20T15:00:00Z");
    const narrow = await getCustomerStats(scope({ fromMs: day, toMs: day + 3600_000 }), NOW);
    expect(narrow).toMatchObject({ customers: 0, cancelledOrders: 0, activeCustomers: 0 });
  });

  it("counts paused customers by a paused delivery today on an active order", async () => {
    const today = "2026-04-15";
    const pausedToday = await makeUser();
    const pausedTomorrow = await makeUser();
    const cancelledPaused = await makeUser();
    await makeOrder(pausedToday.id, { pausedOn: today });
    await makeOrder(pausedTomorrow.id, { pausedOn: "2026-04-16" });
    await makeOrder(cancelledPaused.id, { status: "cancelled", pausedOn: today });
    const s = await getCustomerStats(scope(), NOW);
    expect(s.pausedToday).toBe(1);
    // "Today" is the Toronto day: 02:00 UTC on Apr 16 is still Apr 15 in Toronto.
    const late = await getCustomerStats(scope(), at("2026-04-16T02:00:00Z"));
    expect(late.pausedToday).toBe(1);
  });

  it("buckets signups by Toronto day", async () => {
    // 23:30 Toronto on Mar 31 is Apr 1 in UTC.
    await makeUser(undefined, at("2026-04-01T03:30:00Z"));
    await makeUser(undefined, at("2026-04-01T15:00:00Z"));
    const rows = await getSignupTrend(scope({ fromMs: at("2026-03-01T00:00:00Z"), toMs: at("2026-04-30T00:00:00Z") }));
    expect(rows).toEqual([
      { day: "Mar 31", n: 1 },
      { day: "Apr 01", n: 1 },
    ]);
  });

  it("counts distinct customers per city and orders per status in range", async () => {
    const a = await makeUser("Mississauga");
    const b = await makeUser("Mississauga");
    await makeOrder(a.id);
    await makeOrder(a.id);
    await makeOrder(b.id, { status: "cancelled" });
    expect(await getTopCities(8, scope())).toEqual([{ city: "Mississauga", n: 2 }]);
    const mix = await getSubscriptionMix(scope());
    expect(Object.fromEntries(mix.map((m) => [m.key, m.n]))).toEqual({ active: 2, cancelled: 1 });
    expect(await db.select({ id: orders.id }).from(orders).where(eq(orders.status, "active"))).toHaveLength(2);
  });
});
