import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

let completionStatus: "failed" | "success" | "scheduled" = "failed";
vi.mock("@/lib/services/optimoroute/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/optimoroute/client")>();
  return {
    ...actual,
    deleteOrder: vi.fn(async () => undefined),
    getRoutes: async () => [{ driverSerial: "d1", driverName: "D", stops: [{ id: "stop-1", orderNo: currentOrderNo, stopNumber: 1 }] }],
    getOrderDetails: async () => new Map(),
    getCompletionDetails: async () => new Map([["stop-1", { status: completionStatus, form: { note: "nobody home" } }]]),
  };
});
let currentOrderNo = "";

const { db } = await import("@/db/client");
const { deliveries, deliveryCategorySwaps, orderActivities, orders } = await import("@/db/schema");
const { redeliverTrip, rescheduleDelivery } = await import("../deliveries.service");
const { deleteOrder } = await import("@/lib/services/optimoroute/client");
const { pullCompletions } = await import("../optimoroute/completions");
const { makeTripOrder, resetTrips } = await import("./trip-fixture");

const DEP = "SUB-REDELIVER01";
const PFX = "tredel";
const reset = () => resetTrips(DEP, PFX);

describe("redeliverTrip", () => {
  beforeEach(reset);
  afterAll(reset);

  it("moves the whole Mon trip onto Wed and merges, without touching the pool", async () => {
    const { order, mon, wed } = await makeTripOrder(DEP, PFX);
    await db.update(deliveries).set({ routeSyncedAt: Date.now() }).where(eq(deliveries.id, mon.id));
    await db.insert(deliveryCategorySwaps).values({ deliveryId: mon.id, fromCategory: "sabzi", toCategory: "dal", qtyFrom: 1, qtyTo: 1 });

    const res = await redeliverTrip(mon.publicId, 1n);
    expect(res).toEqual({ targetDate: "2030-01-09", merged: true });

    const [target] = await db.select().from(deliveries).where(eq(deliveries.id, wed.id));
    expect(target.tiffinUnits).toBe(4);
    expect(target.coversDates).toEqual(["2030-01-07", "2030-01-08", "2030-01-09", "2030-01-10"]);
    const swaps = await db.select().from(deliveryCategorySwaps).where(eq(deliveryCategorySwaps.deliveryId, wed.id));
    expect(swaps.map((s) => s.forDate)).toEqual(["2030-01-07"]);

    const [src] = await db.select().from(deliveries).where(eq(deliveries.id, mon.id));
    expect(src.status).toBe("skipped");
    expect(src.pooledAt).toBeNull();
    const [o] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(o.pooledTiffinCount).toBe(0);
    const acts = await db.select().from(orderActivities).where(eq(orderActivities.deliveryId, mon.id));
    expect(acts.some((a) => a.note === "Re-delivered on 2030-01-09 (driver could not deliver)")).toBe(true);
    expect(deleteOrder).toHaveBeenCalledWith(mon.publicId);
  });

  it("creates a plain make-up trip with the same coverage when the next day is empty", async () => {
    const { fri } = await makeTripOrder(DEP, PFX);
    // Friday's next delivery day is Monday 2030-01-14 (no row there): plain make-up row.
    const res = await redeliverTrip(fri.publicId, 1n);
    expect(res).toEqual({ targetDate: "2030-01-14", merged: false });
    const [row] = await db.select().from(deliveries).where(eq(deliveries.makeupForDeliveryId, fri.id));
    expect(row.deliveryDate).toBe("2030-01-14");
    expect(row.tiffinUnits).toBe(3);
    expect(row.coversDates).toEqual(["2030-01-11", "2030-01-12", "2030-01-13"]);
  });

  it("a failed OptimoRoute stop is marked failed: not re-delivered, not pooled", async () => {
    const { order, mon, wed } = await makeTripOrder(DEP, PFX);
    await db.update(deliveries).set({ cutoffAt: 1 }).where(eq(deliveries.id, mon.id));
    currentOrderNo = mon.publicId;
    completionStatus = "failed";

    const res = await pullCompletions("2030-01-07", 1n);
    expect(res.outcomes.find((o) => o.deliveryPublicId === mon.publicId)?.action).toBe("skipped");

    const [m] = await db.select().from(deliveries).where(eq(deliveries.id, mon.id));
    expect([m.status, m.pooledAt]).toEqual(["skipped", null]);
    const [w] = await db.select().from(deliveries).where(eq(deliveries.id, wed.id));
    expect(w.tiffinUnits).toBe(2);
    const [o] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(o.pooledTiffinCount).toBe(0);
  });

  it("a later pull leaves a delivery that was already confirmed successful", async () => {
    const { mon } = await makeTripOrder(DEP, PFX);
    await db.update(deliveries).set({ cutoffAt: 1, optimoCompletionStatus: "success" }).where(eq(deliveries.id, mon.id));
    currentOrderNo = mon.publicId;
    completionStatus = "failed";

    await pullCompletions("2030-01-07", 1n);

    const [m] = await db.select().from(deliveries).where(eq(deliveries.id, mon.id));
    expect([m.status, m.optimoCompletionStatus]).toEqual(["scheduled", "success"]);
  });

  it("a failed tiffin can still be moved after its own cutoff, one day at a time", async () => {
    const { mon } = await makeTripOrder(DEP, PFX);
    await db.update(deliveries).set({ cutoffAt: 1 }).where(eq(deliveries.id, mon.id));
    currentOrderNo = mon.publicId;
    completionStatus = "failed";
    await pullCompletions("2030-01-07", 1n);

    const res = await rescheduleDelivery(mon.publicId, "2030-01-14", 1n, "2030-01-07");
    const [target] = await db.select().from(deliveries).where(eq(deliveries.deliveryDate, res.carriedOn));
    expect([target.status, target.coversDates]).toEqual(["scheduled", ["2030-01-14"]]);
    const [m] = await db.select().from(deliveries).where(eq(deliveries.id, mon.id));
    expect([m.status, m.coversDates]).toEqual(["skipped", ["2030-01-08"]]);
  });
});
