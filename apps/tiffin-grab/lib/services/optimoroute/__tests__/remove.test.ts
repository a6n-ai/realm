import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray, like } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveries, orderActivities, orders, users } from "@/db/schema";
import { loadCatalogSnapshot } from "@/lib/catalog/load";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const deleted: string[] = [];
let failFor = new Set<string>();
let onOptimo: string[] = [];

vi.mock("../client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../client")>();
  return {
    ...actual,
    getRoutes: async () => [
      { driverName: "Driver 1", stops: onOptimo.map((orderNo, i) => ({ orderNo, stopNumber: i + 1 })) },
    ],
    createOrder: async () => {},
    deleteOrder: async (orderNo: string) => {
      if (failFor.has(orderNo)) throw new Error("OptimoRoute refused the delete");
      deleted.push(orderNo);
    },
  };
});

const { removeStops } = await import("../push");

const DATE = (() => {
  const d = new Date(Date.now() + 77 * 86400000);
  d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7));
  return d.toISOString().slice(0, 10);
})();

const DEPLOYMENT = "SUB-RM001";
const USER_PREFIX = "rm";

let orderId: bigint;
let deliveryId: bigint;
let livePublicId: string;

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

describe("removeStops (integration)", () => {
  beforeEach(async () => {
    deleted.length = 0;
    failFor = new Set();
    onOptimo = [];
    await reset();

    const snap = await loadCatalogSnapshot();
    const [u] = await db
      .insert(users)
      .values({ email: `${USER_PREFIX}${Math.random().toString(36).slice(2)}@test.invalid`, role: "user" })
      .returning();

    const [o] = await db
      .insert(orders)
      .values({
        userId: u.id,
        planId: snap.plans.find((p) => p.key === "veg")!.id,
        mealSizeId: snap.mealSizes[0].id,
        frequencyId: snap.frequencies.find((f) => f.key === "5_day")!.id,
        persons: 1,
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
        fullName: "Remove Tester",
        addressLine: "3 Yonge St",
        city: "Toronto",
        postalCode: "M5E 1E5",
      })
      .returning();
    orderId = o.id;

    const [d] = await db
      .insert(deliveries)
      .values({ orderId: o.id, deliveryDate: DATE, status: "scheduled", cutoffAt: Date.now() + 1e9 })
      .returning();
    deliveryId = d.id;
    livePublicId = d.publicId;
  });
  afterAll(reset);

  it("removes a stop that is on OptimoRoute but no longer scheduled", async () => {
    await db.update(deliveries).set({ status: "skipped" }).where(eq(deliveries.id, deliveryId));
    onOptimo = [livePublicId];

    const result = await removeStops(DATE, [livePublicId]);
    expect(result.removed).toBe(1);
    expect(deleted).toEqual([livePublicId]);
  });

  // The guard that matters: a preview rendered a minute ago can be out of date. Deleting
  // straight from that list would take a live stop off a driver's route.
  it("refuses to delete a stop that is scheduled again, even if asked", async () => {
    onOptimo = [livePublicId]; // still scheduled — so it is an UPDATE target, not stale

    const result = await removeStops(DATE, [livePublicId]);
    expect(result.removed).toBe(0);
    expect(result.skipped).toEqual([livePublicId]);
    expect(deleted).toEqual([]);
  });

  it("marks foreign stops as not ours — the account is shared with another business", async () => {
    await db.update(deliveries).set({ status: "skipped" }).where(eq(deliveries.id, deliveryId));
    onOptimo = [livePublicId, "Palka Chatrath"];

    const { previewPush } = await import("../push");
    const preview = await previewPush(DATE);
    expect(preview.remove.find((r) => r.orderNo === livePublicId)?.ours).toBe(true);
    expect(preview.remove.find((r) => r.orderNo === "Palka Chatrath")?.ours).toBe(false);
  });

  it("removes only what was named, not everything stale", async () => {
    await db.update(deliveries).set({ status: "paused" }).where(eq(deliveries.id, deliveryId));
    onOptimo = [livePublicId, "43 Yatharth Aggarwal"];

    const result = await removeStops(DATE, ["43 Yatharth Aggarwal"]);
    expect(deleted).toEqual(["43 Yatharth Aggarwal"]);
    expect(result.removed).toBe(1);
  });

  it("logs the removal against the delivery it belongs to", async () => {
    await db.update(deliveries).set({ status: "skipped" }).where(eq(deliveries.id, deliveryId));
    onOptimo = [livePublicId];

    await removeStops(DATE, [livePublicId]);
    const rows = await db.select().from(orderActivities).where(eq(orderActivities.orderId, orderId));
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("route_pushed");
    expect(rows[0].note).toMatch(/Removed from OptimoRoute/);
  });

  it("reports a failed delete per stop instead of aborting", async () => {
    await db.update(deliveries).set({ status: "skipped" }).where(eq(deliveries.id, deliveryId));
    onOptimo = [livePublicId];
    failFor = new Set([livePublicId]);

    const result = await removeStops(DATE, [livePublicId]);
    expect(result.removed).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.outcomes[0].message).toMatch(/refused the delete/);

    const [activity] = await db.select().from(orderActivities).where(eq(orderActivities.orderId, orderId));
    expect(activity.note).toMatch(/removal failed/i);
  });

  it("does nothing when given an empty list", async () => {
    const result = await removeStops(DATE, []);
    expect(result).toEqual({ date: DATE, removed: 0, failed: 0, skipped: [], outcomes: [] });
    expect(deleted).toEqual([]);
  });
});
