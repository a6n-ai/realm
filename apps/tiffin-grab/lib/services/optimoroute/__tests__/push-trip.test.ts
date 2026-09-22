import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray, like } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveries, deliveryExtraTiffins, orderActivities, orders, payments, users } from "@/db/schema";
import { loadCatalogSnapshot } from "@/lib/catalog/load";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const cfgRef = { sendLoad: false };
vi.mock("../config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config")>();
  return { ...actual, getOptimoRouteConfig: async () => ({ ...actual.DEFAULT_OPTIMOROUTE_CONFIG, sendLoad: cfgRef.sendLoad }) };
});

const { buildPlannedOrders } = await import("../push");
const { buildDispatchRows } = await import("../drivers");

const MONDAY = (() => {
  const d = new Date(Date.now() + 70 * 86400000);
  d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7));
  return d.toISOString().slice(0, 10);
})();
const TUESDAY = new Date(new Date(`${MONDAY}T00:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10);
const DEPLOYMENT = "SUB-OPT002";
const PREFIX = "opttrip";

async function reset() {
  const mine = await db.select({ id: orders.id }).from(orders).where(eq(orders.deploymentId, DEPLOYMENT));
  const ids = mine.map((o) => o.id);
  if (ids.length) {
    await db.delete(orderActivities).where(inArray(orderActivities.orderId, ids));
    await db.delete(payments).where(inArray(payments.orderId, ids));
    await db.delete(deliveries).where(inArray(deliveries.orderId, ids));
    await db.delete(orders).where(inArray(orders.id, ids));
  }
  await db.delete(users).where(like(users.email, `${PREFIX}%@test.invalid`));
}

describe("OptimoRoute payload for a trip carrying several days", () => {
  beforeEach(async () => {
    cfgRef.sendLoad = false;
    await reset();
    const snap = await loadCatalogSnapshot();
    const [u] = await db.insert(users).values({
      email: `${PREFIX}${Math.random().toString(36).slice(2)}@test.invalid`,
      phone: "+1 647 555 7020", role: "user", deliveryNotes: "Leave at door",
    }).returning();
    const [o] = await db.insert(orders).values({
      userId: u.id,
      planId: snap.plans.find((p) => p.key === "veg")!.id,
      mealSizeId: snap.mealSizes[0].id,
      frequencyId: snap.frequencies.find((f) => f.key === "5_day")!.id,
      persons: 1, mealSlots: ["lunch"], categoryCounts: { sabzi: 1 }, durationWeeks: 1, startDate: MONDAY,
      tiffinCount: 5, perTiffinPrice: "10.00", pricingSnapshot: {}, total: "50.00", status: "active",
      deploymentId: DEPLOYMENT, fullName: "Trip Tester", addressLine: "9 Bay St", city: "Oakville", postalCode: "L6H 1A1",
    }).returning();
    await db.insert(deliveries).values({
      orderId: o.id, deliveryDate: MONDAY, status: "scheduled", cutoffAt: Date.now() + 1e9,
      coversDates: [MONDAY, TUESDAY], tiffinUnits: 2,
    });
    await db.insert(payments).values({
      orderId: o.id, amount: o.total, status: "simulated_paid", method: "simulated", capturedAt: Date.now(),
    });
  });
  afterAll(reset);

  it("appends coverage to the notes, keeps customer notes first, and fills customField3", async () => {
    const [p] = await buildPlannedOrders(MONDAY);
    expect(p.notes.split("\n").slice(0, 2)).toEqual(["Leave at door", "Covers Mon + Tue · 2 tiffins"]);
    expect(p.payload.customField3).toBe("Covers Mon + Tue · 2 tiffins");
    expect(p.tiffinUnits).toBe(2);
  });

  it("leaves customField1/2/4 exactly as before", async () => {
    const [p] = await buildPlannedOrders(MONDAY);
    expect(p.payload.customField1).toBe("6475557020");
    expect(p.payload.customField2).toBe("Trip Tester");
    expect(p.payload.customField4).toBe(p.plan);
  });

  it("scales duration by the extra tiffins", async () => {
    const [p] = await buildPlannedOrders(MONDAY);
    expect(p.durationMins).toBe(2); // base 1 + 1 extra tiffin x 1 min
  });

  it("sends load1 only when sendLoad is on", async () => {
    expect((await buildPlannedOrders(MONDAY))[0].payload).not.toHaveProperty("load1");
    cfgRef.sendLoad = true;
    expect((await buildPlannedOrders(MONDAY))[0].payload.load1).toBe(2);
  });

  it("dispatch rows carry units, covered days and the driver-facing notes", async () => {
    const [r] = await buildDispatchRows(MONDAY);
    expect(r.tiffinUnits).toBe(2);
    expect(r.coveredDates).toEqual([MONDAY, TUESDAY]);
    expect(r.notes).toContain("Covers Mon + Tue");
  });

  it("calls out a day doubled by a moved-in tiffin instead of only totalling units", async () => {
    const [delivery] = await db.select().from(deliveries).where(eq(deliveries.deliveryDate, MONDAY));
    await db.insert(deliveryExtraTiffins).values({ deliveryId: delivery!.id, eatDate: TUESDAY });
    await db.update(deliveries).set({ tiffinUnits: 3 }).where(eq(deliveries.id, delivery!.id));

    const [p] = await buildPlannedOrders(MONDAY);
    expect(p.payload.customField3).toBe("Covers Mon + Tue · 3 tiffins (Tue x2)");
  });

  it("a plain single-day stop is untouched: no coverage, no customField3", async () => {
    await db.update(deliveries).set({ coversDates: null, tiffinUnits: 1 }).where(eq(deliveries.deliveryDate, MONDAY));
    const [p] = await buildPlannedOrders(MONDAY);
    expect(p.coverage).toBeNull();
    expect(p.notes).toBe("Leave at door");
    expect(p.payload).not.toHaveProperty("customField3");
  });
});
