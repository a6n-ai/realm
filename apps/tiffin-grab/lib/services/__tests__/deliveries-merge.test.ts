import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { ValidationError } from "@foundry/commons";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { deliveries, deliveryCategorySwaps, deliveryExtraTiffins, orderActivities, orders } = await import("@/db/schema");
const { reconcilePoolFromMisses, rescheduleDelivery } = await import("../deliveries.service");
const { myAgendaDots } = await import("../customer-deliveries.service");
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

  it("moves only Mon's tiffin onto Wed: it becomes a second Wed tiffin, Tue stays on Monday", async () => {
    const { order, mon, wed } = await makeTripOrder(DEP, PFX);
    await db.update(deliveries).set({ coversDates: ["2030-01-09"], tiffinUnits: 1 }).where(eq(deliveries.id, wed.id));
    await db.insert(deliveryCategorySwaps).values([
      { deliveryId: mon.id, fromCategory: "sabzi", toCategory: "dal", qtyFrom: 1, qtyTo: 1 },
      { deliveryId: mon.id, fromCategory: "roti", toCategory: "rice", qtyFrom: 1, qtyTo: 1, forDate: "2030-01-08" },
    ]);

    const res = await rescheduleDelivery(mon.publicId, "2030-01-09", 1n);
    expect(res.merged).toBe(true);

    const rows = await db.select().from(deliveries).where(eq(deliveries.orderId, order.id));
    expect(rows.filter((r) => r.deliveryDate === "2030-01-09")).toHaveLength(1);
    const [target] = await db.select().from(deliveries).where(eq(deliveries.id, wed.id));
    expect([target.tiffinUnits, target.coversDates]).toEqual([2, ["2030-01-09"]]);

    // Mon's own swap stays behind (the tiffin now eats Wed's meal); Tue's swap stays with Tue.
    expect(await db.select().from(deliveryCategorySwaps).where(eq(deliveryCategorySwaps.deliveryId, wed.id))).toEqual([]);
    const [src] = await db.select().from(deliveries).where(eq(deliveries.id, mon.id));
    expect([src.status, src.coversDates, src.tiffinUnits, src.mergedIntoDeliveryId]).toEqual(["scheduled", ["2030-01-08"], 1, null]);
    const srcSwaps = await db.select().from(deliveryCategorySwaps).where(eq(deliveryCategorySwaps.deliveryId, mon.id));
    expect(srcSwaps.map((x) => [x.fromCategory, x.forDate])).toEqual([["roti", "2030-01-08"]]);
    const acts = await db.select().from(orderActivities).where(eq(orderActivities.deliveryId, mon.id));
    expect(acts.some((x) => x.note === "Moved 2030-01-07's tiffin to 2030-01-09 (merged)")).toBe(true);
  });

  it("a merged source is never pooled after its cutoff, and is not debt", async () => {
    const { order, mon, wed } = await makeTripOrder(DEP, PFX);
    await db.update(deliveries).set({ coversDates: ["2030-01-09"], tiffinUnits: 1 }).where(eq(deliveries.id, wed.id));
    await db.update(deliveries).set({ coversDates: ["2030-01-07"], tiffinUnits: 1 }).where(eq(deliveries.id, mon.id));
    await rescheduleDelivery(mon.publicId, "2030-01-09", 1n);
    await db.update(deliveries).set({ cutoffAt: 1 }).where(eq(deliveries.id, mon.id));
    expect(await reconcilePoolFromMisses(order.id)).toBe(0);
    const [o] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(o.pooledTiffinCount).toBe(0);
  });

  it("rejects a move that would push a delivery past 3 tiffins", async () => {
    const { mon } = await makeTripOrder(DEP, PFX);
    await expect(rescheduleDelivery(mon.publicId, "2030-01-11", 1n)).rejects.toThrow(/at most 3/); // Fri already carries 3
  });

  it("moving a tiffin onto a day already eaten records an extra and caps that day at 2", async () => {
    const { mon, wed } = await makeTripOrder(DEP, PFX);
    await db.update(deliveries).set({ coversDates: ["2030-01-09"], tiffinUnits: 1 }).where(eq(deliveries.id, wed.id));
    await db.update(deliveries).set({ coversDates: ["2030-01-07"], tiffinUnits: 1 }).where(eq(deliveries.id, mon.id));
    await rescheduleDelivery(mon.publicId, "2030-01-09", 1n);
    const [target] = await db.select().from(deliveries).where(eq(deliveries.id, wed.id));
    expect(target.tiffinUnits).toBe(2);
    expect(target.coversDates).toEqual(["2030-01-09"]);
    const extras = await db.select().from(deliveryExtraTiffins).where(eq(deliveryExtraTiffins.deliveryId, wed.id));
    expect(extras.map((e) => e.eatDate)).toEqual(["2030-01-09"]);
  });

  it("only one move per tiffin: the one moved onto Wed can't move again", async () => {
    const { mon, wed } = await makeTripOrder(DEP, PFX);
    await db.update(deliveries).set({ coversDates: ["2030-01-09"], tiffinUnits: 1 }).where(eq(deliveries.id, wed.id));
    await rescheduleDelivery(mon.publicId, "2030-01-09", 1n);
    await rescheduleDelivery(wed.publicId, "2030-01-14", 1n); // Wed's own tiffin
    await expect(rescheduleDelivery(wed.publicId, "2030-01-16", 1n)).rejects.toThrow(/already moved/);
  });

  it("a make-up row cannot be moved again", async () => {
    const { mon } = await makeTripOrder(DEP, PFX);
    await db.update(deliveries).set({ coversDates: ["2030-01-07"], tiffinUnits: 1 }).where(eq(deliveries.id, mon.id));
    await rescheduleDelivery(mon.publicId, "2030-01-14", 1n);
    const [makeup] = await db.select().from(deliveries).where(eq(deliveries.makeupForDeliveryId, mon.id));
    await expect(rescheduleDelivery(makeup.publicId, "2030-01-16", 1n)).rejects.toThrow(/make-up/i);
  });

  it("onto an open day, only the one tiffin travels, as the picked day's tiffin", async () => {
    const { order, mon } = await makeTripOrder(DEP, PFX);
    const res = await rescheduleDelivery(mon.publicId, "2030-01-14", 1n);
    expect(res.merged).toBe(false);
    const [row] = await db.select().from(deliveries).where(eq(deliveries.deliveryDate, "2030-01-14"));
    expect([row.orderId, row.coversDates, row.tiffinUnits, row.makeupForDeliveryId]).toEqual([order.id, ["2030-01-14"], 1, null]);
    const [src] = await db.select().from(deliveries).where(eq(deliveries.id, mon.id));
    expect([src.status, src.coversDates]).toEqual(["scheduled", ["2030-01-08"]]);
  });

  it("myAgendaDots marks a merged-away day as moved, not the target's live status", async () => {
    const { order, mon, wed } = await makeTripOrder(DEP, PFX);
    await db.update(deliveries).set({ coversDates: ["2030-01-09"], tiffinUnits: 1 }).where(eq(deliveries.id, wed.id));
    await db.update(deliveries).set({ coversDates: ["2030-01-07"], tiffinUnits: 1 }).where(eq(deliveries.id, mon.id));
    await rescheduleDelivery(mon.publicId, "2030-01-09", 1n);
    const dots = await myAgendaDots(order.userId!, "2030-01-01", "2030-02-01");
    expect(dots["2030-01-07"]!.some((d) => d.moved)).toBe(true);
    expect(dots["2030-01-09"]!.some((d) => !d.moved && d.truck)).toBe(true);
  });

  it("5-day plan eating Mon/Tue/Thu: moving Thursday onto Wednesday puts the truck there and marks Thursday moved", async () => {
    const { order } = await makeTripOrder(DEP, PFX, 1, "5_day", 1, { days: ["mon", "tue", "thu"], tiffinCount: 3 });
    const before = await db.select().from(deliveries).where(eq(deliveries.orderId, order.id));
    expect(before.map((r) => r.deliveryDate).sort()).toEqual(["2030-01-07", "2030-01-08", "2030-01-10"]);
    const thu = before.find((r) => r.deliveryDate === "2030-01-10")!;
    // Wednesday 2030-01-09 is the next Wednesday on this 5-day plan; Thursday itself is not a carrier anymore.
    await rescheduleDelivery(thu.publicId, "2030-01-09", 1n);

    const dots = await myAgendaDots(order.userId!, "2030-01-01", "2030-02-01");
    expect(dots["2030-01-09"]?.some((d) => d.truck && d.deliveryDate === "2030-01-09")).toBe(true);
    expect(dots["2030-01-07"]?.some((d) => d.truck)).toBe(true);
    expect(dots["2030-01-08"]?.some((d) => d.truck)).toBe(true);
    expect(dots["2030-01-10"]!.map((d) => [d.moved, d.truck, d.deliveryDate])).toEqual([[true, false, "2030-01-09"]]);
  });

  it("myAgendaDots marks the arrival day when the eat dates stayed on the previous week", async () => {
    const { order, mon } = await makeTripOrder(DEP, PFX);
    await rescheduleDelivery(mon.publicId, "2030-01-14", 1n);
    const dots = await myAgendaDots(order.userId!, "2030-01-01", "2030-02-01");
    expect(dots["2030-01-14"]?.some((d) => d.truck && d.deliveryDate === "2030-01-14")).toBe(true);
  });

  it("rejects moving a tiffin onto its own day", async () => {
    const { mon } = await makeTripOrder(DEP, PFX);
    await expect(rescheduleDelivery(mon.publicId, "2030-01-07", 1n)).rejects.toBeInstanceOf(ValidationError);
  });
});
