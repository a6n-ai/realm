import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { inArray } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
vi.mock("@/lib/auth/session", () => ({ getSession: async () => null }));

const { db } = await import("@/db/client");
const { deliveries, deliveryFrequencies, mealSizes, orders, organization, plans, users } = await import("@/db/schema");
const { getKitchenWeek } = await import("../overview.service");

const suffix = Math.random().toString(36).slice(2);
const MONDAY = "2035-03-05";
let orgA = "";
let orgB = "";
const orderIds: bigint[] = [];
const userIds: bigint[] = [];
let sizeName = ""; // the plan name the seeded orders use

async function makeOrder(org: string, k: number) {
  const [u] = await db.insert(users).values({ email: `kw${k}-${suffix}@x.test`, name: `KW ${k}`, role: "user" }).returning();
  userIds.push(u!.id);
  const [plan] = await db.select({ id: plans.id, name: plans.name }).from(plans).orderBy(plans.id).limit(1);
  const [size] = await db.select({ id: mealSizes.id, name: mealSizes.name }).from(mealSizes).limit(1);
  const [freq] = await db.select({ id: deliveryFrequencies.id }).from(deliveryFrequencies).limit(1);
  sizeName = plan!.name; // rows are per meal plan
  const [o] = await db
    .insert(orders)
    .values({
      userId: u!.id, planId: plan!.id, mealSizeId: size!.id, frequencyId: freq!.id, durationWeeks: 1, startDate: "2035-01-01",
      tiffinCount: 5, perTiffinPrice: "10.00", pricingSnapshot: {}, total: "50.00", deploymentId: `KW-${suffix}-${k}`,
      fullName: `KW ${k}`, addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6", organizationId: org, status: "active",
    })
    .returning();
  orderIds.push(o!.id);
  return o!.id;
}

const put = (orderId: bigint, deliveryDate: string, tiffinUnits: number, status: "scheduled" | "skipped" = "scheduled") =>
  db.insert(deliveries).values({ orderId, deliveryDate, status, cutoffAt: 0, tiffinUnits });

describe("getKitchenWeek (integration)", () => {
  beforeAll(async () => {
    [{ id: orgA }] = await db.insert(organization).values({ name: "KW A", clientCode: `KA-${suffix}` }).returning({ id: organization.id });
    [{ id: orgB }] = await db.insert(organization).values({ name: "KW B", clientCode: `KB-${suffix}` }).returning({ id: organization.id });
    const a = await makeOrder(orgA, 1);
    const b = await makeOrder(orgB, 2);
    await put(a, "2035-03-05", 2); // Monday, in
    await put(a, "2035-03-11", 3); // Sunday, in
    await put(a, "2035-03-12", 9); // next Monday, out
    await put(a, "2035-03-06", 7, "skipped"); // not scheduled, out
    await put(a, "2035-02-27", 4); // last week
    await put(b, "2035-03-06", 5); // other franchise
  });

  afterAll(async () => {
    await db.delete(deliveries).where(inArray(deliveries.orderId, orderIds));
    await db.delete(orders).where(inArray(orders.id, orderIds));
    await db.delete(users).where(inArray(users.id, userIds));
    await db.delete(organization).where(inArray(organization.id, [orgA, orgB]));
  });

  it("scopes to the visible franchises and bounds the week Monday to Sunday", async () => {
    const rows = await getKitchenWeek([orgA], MONDAY);
    expect(rows).toEqual([{ mealSize: sizeName, days: [2, 0, 0, 0, 0, 0, 3], total: 5, prevTotal: 4 }]);
  });

  it("sums every franchise for all", async () => {
    const rows = (await getKitchenWeek("all", MONDAY)).find((r) => r.mealSize === sizeName);
    expect(rows?.total).toBe(10);
  });

  it("returns nothing when no franchise is visible", async () => {
    expect(await getKitchenWeek([], MONDAY)).toEqual([]);
  });
});
