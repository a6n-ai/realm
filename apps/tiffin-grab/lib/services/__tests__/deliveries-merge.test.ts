import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { ValidationError } from "@foundry/commons";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { deliveries, deliveryCategorySwaps, orderActivities, orders } = await import("@/db/schema");
const { reconcilePoolFromMisses, rescheduleDelivery } = await import("../deliveries.service");
const { makeTripOrder, resetTrips } = await import("./trip-fixture");

const DEP = "SUB-MERGE01";
const PFX = "tmerge";
const reset = () => resetTrips(DEP, PFX);

describe("trip coverage on materialize", () => {
  beforeEach(reset);
  afterAll(reset);

  it("stamps covered dates per trip: Mon [7,8], Wed [9,10], Fri [11,12,13]", async () => {
    const { mon, wed, fri } = await makeTripOrder(DEP, PFX);
    expect(mon.coversDates).toEqual(["2030-01-07", "2030-01-08"]);
    expect(wed.coversDates).toEqual(["2030-01-09", "2030-01-10"]);
    expect(fri.coversDates).toEqual(["2030-01-11", "2030-01-12", "2030-01-13"]);
    expect([mon.tiffinUnits, wed.tiffinUnits, fri.tiffinUnits]).toEqual([2, 2, 3]);
  });
});

describe("rescheduleDelivery merge", () => {
  beforeEach(reset);
  afterAll(reset);

  it("merges Mon trip into Wed trip: one Wed row of 4 covering 7..10, swaps keep their eating day", async () => {
    const { order, mon, wed } = await makeTripOrder(DEP, PFX);
    await db.insert(deliveryCategorySwaps).values([
      { deliveryId: mon.id, fromCategory: "sabzi", toCategory: "dal", qtyFrom: 1, qtyTo: 1 },
      { deliveryId: mon.id, fromCategory: "roti", toCategory: "rice", qtyFrom: 1, qtyTo: 1, forDate: "2030-01-08" },
    ]);

    const res = await rescheduleDelivery(mon.publicId, "2030-01-09", 1n);
    expect(res.merged).toBe(true);

    const rows = await db.select().from(deliveries).where(eq(deliveries.orderId, order.id));
    expect(rows.filter((r) => r.deliveryDate === "2030-01-09")).toHaveLength(1);
    const [target] = await db.select().from(deliveries).where(eq(deliveries.id, wed.id));
    expect(target.tiffinUnits).toBe(4);
    expect(target.coversDates).toEqual(["2030-01-07", "2030-01-08", "2030-01-09", "2030-01-10"]);

    const swaps = await db.select().from(deliveryCategorySwaps).where(eq(deliveryCategorySwaps.deliveryId, wed.id));
    expect(swaps.map((s) => [s.fromCategory, s.forDate]).sort()).toEqual([["roti", "2030-01-08"], ["sabzi", "2030-01-07"]]);

    const [src] = await db.select().from(deliveries).where(eq(deliveries.id, mon.id));
    expect(src.status).toBe("skipped");
    expect(src.mergedIntoDeliveryId).toBe(wed.id);
    const acts = await db.select().from(orderActivities).where(eq(orderActivities.deliveryId, mon.id));
    expect(acts.some((a) => a.note === "Moved to 2030-01-09 (merged)")).toBe(true);
  });

  it("a merged source is never pooled after its cutoff, and is not debt", async () => {
    const { order, mon } = await makeTripOrder(DEP, PFX);
    await rescheduleDelivery(mon.publicId, "2030-01-09", 1n);
    await db.update(deliveries).set({ cutoffAt: 1 }).where(eq(deliveries.id, mon.id));
    expect(await reconcilePoolFromMisses(order.id)).toBe(0);
    const [o] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(o.pooledTiffinCount).toBe(0);
  });

  it("without an occupied target keeps coverage unchanged on the make-up row", async () => {
    const { order, mon } = await makeTripOrder(DEP, PFX);
    // Tuesday is not a delivery day; Monday next week is.
    const res = await rescheduleDelivery(mon.publicId, "2030-01-14", 1n);
    expect(res.merged).toBe(false);
    const [row] = await db.select().from(deliveries).where(eq(deliveries.deliveryDate, "2030-01-14"));
    expect(row.orderId).toBe(order.id);
    expect(row.coversDates).toEqual(["2030-01-07", "2030-01-08"]);
    expect(row.tiffinUnits).toBe(2);
    expect(row.makeupForDeliveryId).toBe(mon.id);
  });

  it("still rejects a target that is not one of the order's delivery days", async () => {
    const { mon } = await makeTripOrder(DEP, PFX);
    await expect(rescheduleDelivery(mon.publicId, "2030-01-08", 1n)).rejects.toBeInstanceOf(ValidationError);
  });
});
