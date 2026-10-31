import { afterAll, describe, expect, it, vi } from "vitest";
import { inArray } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { deliveries, deliveryFrequencies, mealSizes, orders, organization, plans, users } = await import("@/db/schema");
const { buildAnalyticsScope } = await import("../scope");
const { freeTiffins } = await import("../money");
const { zonedRangeMs } = await import("@/lib/analytics/drill");

const TZ = "America/Toronto";
const suffix = Math.random().toString(36).slice(2);
const range = zonedRangeMs("2035-03-01", "2035-03-31", TZ);
const scopeFor = (orgIds: "all" | string[]) => buildAnalyticsScope({ from: String(range.from), to: String(range.to) }, orgIds, TZ);

const userIds: bigint[] = [];
const orderIds: bigint[] = [];
const orgIds: string[] = [];
let n = 0;

async function makeOrg() {
  const [o] = await db.insert(organization).values({ name: "Free", clientCode: `FRE-${suffix}-${n++}` }).returning({ id: organization.id });
  orgIds.push(o!.id);
  return o!.id;
}

async function makeOrder(org: string, snapshot: Record<string, unknown>, tiffinCount = 10) {
  const [plan] = await db.select({ id: plans.id }).from(plans).limit(1);
  const [size] = await db.select({ id: mealSizes.id }).from(mealSizes).limit(1);
  const [freq] = await db.select({ id: deliveryFrequencies.id }).from(deliveryFrequencies).limit(1);
  const [u] = await db.insert(users).values({ email: `free${n++}-${suffix}@x.test`, name: "F", role: "user" }).returning();
  userIds.push(u!.id);
  const [o] = await db
    .insert(orders)
    .values({
      userId: u!.id, planId: plan!.id, mealSizeId: size!.id, frequencyId: freq!.id, durationWeeks: 1, startDate: "2035-03-01",
      tiffinCount, perTiffinPrice: "10.00", pricingSnapshot: snapshot, total: String(snapshot.total ?? 0),
      deploymentId: `FRE-${suffix}-${n++}`, fullName: "Fixture", addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6", organizationId: org,
    })
    .returning();
  orderIds.push(o!.id);
  return o!;
}

const free = (orderId: bigint, date: string, over: { note?: string | null; status?: "scheduled" | "cancelled" } = {}) =>
  db.insert(deliveries).values({
    orderId, deliveryDate: date, status: over.status ?? "scheduled", cutoffAt: 0, tiffinUnits: 1,
    complimentaryNote: over.note === undefined ? "Free tiffin" : over.note,
  });

describe("freeTiffins", () => {
  afterAll(async () => {
    if (orderIds.length) {
      await db.delete(deliveries).where(inArray(deliveries.orderId, orderIds));
      await db.delete(orders).where(inArray(orders.id, orderIds));
    }
    await db.delete(users).where(inArray(users.id, userIds));
    await db.delete(organization).where(inArray(organization.id, orgIds));
  });

  it("values priced orders ex tax, counts unpriced ones, skips cancelled, non-free and out-of-range rows", async () => {
    const org = await makeOrg();
    // ($113 - $13 tax - $20 add-on + $2 add-on tax) / 10 tiffins = $8.20 each
    const priced = await makeOrder(org, { total: 113, taxTotal: 13, tiffinCount: 10, appliedAddons: { addonSubtotal: 18, taxTotal: 2, amountDue: 20 } });
    const noPrice = await makeOrder(org, { total: 0, taxTotal: 0, tiffinCount: 10 });
    const migrated = await makeOrder(org, { total: 100, taxTotal: 0, tiffinCount: 10, wordpress: { orderId: 1 } });
    await free(priced.id, "2035-03-05");
    await free(priced.id, "2035-03-06");
    await free(priced.id, "2035-03-07", { status: "cancelled" });
    await free(priced.id, "2035-03-08", { note: null });
    await free(priced.id, "2035-04-02");
    await free(noPrice.id, "2035-03-05");
    await free(migrated.id, "2035-03-05");

    expect(await freeTiffins(scopeFor([org]))).toEqual({ count: 4, valued: 2, notValued: 2, amount: 16.4 });
  });

  it("is scoped through the order's franchise", async () => {
    const a = await makeOrg();
    const b = await makeOrg();
    const oa = await makeOrder(a, { total: 100, taxTotal: 0, tiffinCount: 10 });
    const ob = await makeOrder(b, { total: 50, taxTotal: 0, tiffinCount: 10 });
    await free(oa.id, "2035-03-10");
    await free(ob.id, "2035-03-10");
    expect(await freeTiffins(scopeFor([a]))).toMatchObject({ count: 1, amount: 10 });
    expect(await freeTiffins(scopeFor([b]))).toMatchObject({ count: 1, amount: 5 });
    expect(await freeTiffins(scopeFor([]))).toEqual({ count: 0, valued: 0, notValued: 0, amount: 0 });
  });
});
