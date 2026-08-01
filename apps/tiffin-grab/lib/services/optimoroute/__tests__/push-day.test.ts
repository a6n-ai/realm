import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray, like } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveries, orderActivities, orders, users } from "@/db/schema";
import { loadCatalogSnapshot } from "@/lib/catalog/load";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

// Only the two network calls are faked; the pooling, payload building, diffing, and
// activity writing all run for real.
const sent: { orderNo: string }[] = [];
let failFor: Set<string> = new Set();
let existingOnOptimo: string[] = [];

vi.mock("../client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../client")>();
  return {
    ...actual,
    getRoutes: async () => [
      { driverName: "Driver 4", stops: existingOnOptimo.map((orderNo, i) => ({ orderNo, stopNumber: i + 1 })) },
    ],
    createOrder: async (payload: { orderNo: string }) => {
      if (failFor.has(payload.orderNo)) throw new Error("OptimoRoute rejected the address");
      sent.push({ orderNo: payload.orderNo });
    },
  };
});

const { buildPlannedOrders, previewPush, pushDay } = await import("../push");

const DATE = (() => {
  const d = new Date(Date.now() + 63 * 86400000);
  d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7));
  return d.toISOString().slice(0, 10);
})();

const DEPLOYMENT = "SUB-OPT001";
const USER_PREFIX = "opt";

let orderId: bigint;
let deliveryPublicId: string;

async function reset() {
  const mine = await db.select({ id: orders.id }).from(orders).where(eq(orders.deploymentId, DEPLOYMENT));
  const ids = mine.map((o) => o.id);
  if (ids.length) {
    await db.delete(orderActivities).where(inArray(orderActivities.orderId, ids));
    await db.delete(deliveries).where(inArray(deliveries.orderId, ids));
    await db.delete(orders).where(inArray(orders.id, ids));
  }
  await db.delete(users).where(like(users.email, `${USER_PREFIX}%@test.invalid`));
}

describe("OptimoRoute push (integration)", () => {
  beforeEach(async () => {
    sent.length = 0;
    failFor = new Set();
    existingOnOptimo = [];
    await reset();

    const snap = await loadCatalogSnapshot();
    const [u] = await db
      .insert(users)
      .values({
        email: `${USER_PREFIX}${Math.random().toString(36).slice(2)}@test.invalid`,
        phone: "+1 647 555 7010",
        role: "user",
        deliveryNotes: "Upstairs Delivery, buzz 12",
      })
      .returning();

    const [o] = await db
      .insert(orders)
      .values({
        userId: u.id,
        planId: snap.plans.find((p) => p.key === "veg")!.id,
        mealSizeId: snap.mealSizes[0].id,
        frequencyId: snap.frequencies.find((f) => f.key === "5_day")!.id,
        persons: 2,
        mealSlots: ["lunch"],
        categoryCounts: { sabzi: 1 },
        durationWeeks: 1,
        startDate: DATE,
        tiffinCount: 5,
        perTiffinPrice: "10.00",
        pricingSnapshot: {},
        total: "50.00",
        status: "active",
        deploymentId: DEPLOYMENT,
        fullName: "Route Tester",
        addressLine: "5 King St",
        city: "Toronto",
        postalCode: "M5H 1A1",
      })
      .returning();
    orderId = o.id;

    const [d] = await db
      .insert(deliveries)
      .values({ orderId: o.id, deliveryDate: DATE, status: "scheduled", cutoffAt: Date.now() + 1e9 })
      .returning();
    deliveryPublicId = d.publicId;
  });
  afterAll(reset);

  // The bug this test exists for: routes used to be built from the label sheet, which
  // returns nothing when the kitchen has not released the week. Addresses are known
  // regardless, and a route that silently plans zero stops is worse than no route.
  it("plans stops even though no menu week is released", async () => {
    const planned = await buildPlannedOrders(DATE);
    expect(planned).toHaveLength(1);
    expect(planned[0].customerName).toBe("Route Tester");
    expect(planned[0].address).toBe("5 King St, Toronto M5H 1A1");
  });

  it("sends one stop per delivery, not one per person", async () => {
    // persons: 2 — two labels get printed, but it is one door.
    const planned = await buildPlannedOrders(DATE);
    expect(planned).toHaveLength(1);
    expect(planned[0].orderNo).toBe(deliveryPublicId);
  });

  it("applies the Toronto + upstairs stop duration and normalises the phone", async () => {
    const [planned] = await buildPlannedOrders(DATE);
    expect(planned.durationMins).toBe(7);
    expect(planned.payload.customField1).toBe("6475557010");
    expect(planned.payload.phone).toBe("6475557010");
  });

  it("uses MERGE so a dispatcher's manual edits survive", async () => {
    const [planned] = await buildPlannedOrders(DATE);
    expect(planned.payload.operation).toBe("MERGE");
  });

  it("splits create from update against what OptimoRoute already has", async () => {
    let preview = await previewPush(DATE);
    expect(preview.create.map((c) => c.orderNo)).toEqual([deliveryPublicId]);
    expect(preview.update).toHaveLength(0);

    existingOnOptimo = [deliveryPublicId];
    preview = await previewPush(DATE);
    expect(preview.create).toHaveLength(0);
    expect(preview.update.map((c) => c.orderNo)).toEqual([deliveryPublicId]);
  });

  it("reports stale stops but never deletes them", async () => {
    existingOnOptimo = [deliveryPublicId, "dlv_gone_away"];
    const preview = await previewPush(DATE);
    expect(preview.remove.map((r) => r.orderNo)).toEqual(["dlv_gone_away"]);

    const result = await pushDay(DATE);
    expect(result.staleCount).toBe(1);
    // Only the live stop was sent; the stale one was left alone.
    expect(sent.map((s) => s.orderNo)).toEqual([deliveryPublicId]);
  });

  it("logs one activity per stop, answering 'was this on the route?'", async () => {
    await pushDay(DATE);
    const rows = await db
      .select()
      .from(orderActivities)
      .where(eq(orderActivities.orderId, orderId));
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("route_pushed");
    expect(rows[0].deliveryId).not.toBeNull();
    expect(rows[0].note).toContain(DATE);
  });

  it("records a failure per stop instead of aborting the run", async () => {
    failFor = new Set([deliveryPublicId]);
    const result = await pushDay(DATE);

    expect(result.pushed).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.outcomes[0].message).toMatch(/rejected the address/);

    const [activity] = await db
      .select()
      .from(orderActivities)
      .where(eq(orderActivities.orderId, orderId));
    expect(activity.note).toMatch(/push failed/i);
  });

  it("is idempotent — re-running sends the same set again, not a duplicate stop", async () => {
    await pushDay(DATE);
    existingOnOptimo = [deliveryPublicId];
    await pushDay(DATE);
    expect(sent.map((s) => s.orderNo)).toEqual([deliveryPublicId, deliveryPublicId]);
  });
});
