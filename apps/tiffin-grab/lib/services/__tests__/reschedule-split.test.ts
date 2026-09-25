// Moving ONE eating day off a multi-day trip (e.g. Saturday off a Fri+Sat+Sun trip) must split
// off only that tiffin — the rest of the trip keeps delivering on its own date, untouched.
// This is the exact bug reported in prod: moving "Friday" (really: one of its riders) dragged
// the whole Fri+Sat+Sun bundle along.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { ValidationError } from "@foundry/commons";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { deliveries, deliveryCategorySwaps, orders } = await import("@/db/schema");
const { rescheduleDelivery } = await import("../deliveries.service");
const { makeTripOrder, resetTrips } = await import("./trip-fixture");

const DEP = "SUB-SPLIT01";
const PFX = "tsplit";
const reset = () => resetTrips(DEP, PFX);

describe("rescheduleDelivery: splitting one eating day off a multi-day trip", () => {
  beforeEach(reset);
  afterAll(reset);

  it("moving Saturday off Fri+Sat+Sun leaves Fri+Sun on the original trip, still scheduled", async () => {
    const { fri } = await makeTripOrder(DEP, PFX);
    const res = await rescheduleDelivery(fri.publicId, "2030-01-19", 1n, "2030-01-12"); // Sat -> next Sat (2030-01-19 is a Sat, snaps to Fri 2030-01-18)
    expect(res.merged).toBe(false);

    const [source] = await db.select().from(deliveries).where(eq(deliveries.id, fri.id));
    expect(source.status).toBe("scheduled");
    expect(source.mergedIntoDeliveryId).toBeNull();
    expect(source.coversDates).toEqual(["2030-01-11", "2030-01-13"]);
    expect(source.tiffinUnits).toBe(2);

    const [target] = await db.select().from(deliveries).where(eq(deliveries.deliveryDate, res.carriedOn));
    expect(target.coversDates).toEqual(["2030-01-12"]);
    expect(target.tiffinUnits).toBe(1);
    expect(target.makeupForDeliveryId).toBeNull();
  });

  it("moving the anchor day (Friday itself) on MWF splits only Friday's tiffin, leaving Sat+Sun on Friday", async () => {
    const { fri } = await makeTripOrder(DEP, PFX);
    const res = await rescheduleDelivery(fri.publicId, "2030-01-18", 1n, "2030-01-11"); // sourceEatDate == trip's own date
    expect(res.merged).toBe(false);

    const [source] = await db.select().from(deliveries).where(eq(deliveries.id, fri.id));
    expect(source.status).toBe("scheduled");
    expect(source.mergedIntoDeliveryId).toBeNull();
    expect(source.coversDates).toEqual(["2030-01-12", "2030-01-13"]);
    expect(source.tiffinUnits).toBe(2);

    const [target] = await db.select().from(deliveries).where(eq(deliveries.deliveryDate, res.carriedOn));
    expect(target.coversDates).toEqual(["2030-01-11"]);
    expect(target.tiffinUnits).toBe(1);
    expect(target.makeupForDeliveryId).toBeNull();
  });

  it("moving Friday onto next Thursday merges only that tiffin onto Wednesday, under the 3-tiffin cap", async () => {
    const { fri } = await makeTripOrder(DEP, PFX, 1, "mwf", 2);
    // Thu 2030-01-17 snaps to Wed 2030-01-16, which already carries Wed+Thu (2). Friday alone makes 3.
    const res = await rescheduleDelivery(fri.publicId, "2030-01-17", 1n, "2030-01-11");
    expect(res.merged).toBe(true);
    expect(res.carriedOn).toBe("2030-01-16");

    const [source] = await db.select().from(deliveries).where(eq(deliveries.id, fri.id));
    expect(source.status).toBe("scheduled");
    expect(source.coversDates).toEqual(["2030-01-12", "2030-01-13"]);
    expect(source.tiffinUnits).toBe(2);

    const [wed] = await db.select().from(deliveries).where(eq(deliveries.deliveryDate, "2030-01-16"));
    expect(wed.coversDates).toEqual(["2030-01-11", "2030-01-16", "2030-01-17"]);
    expect(wed.tiffinUnits).toBe(3);
  });

  it("moving the anchor day (Friday itself) on a 5-day plan splits only Friday's tiffin off, leaving Sat+Sun on Friday", async () => {
    const { fri } = await makeTripOrder(DEP, PFX, 1, "5_day");
    const res = await rescheduleDelivery(fri.publicId, "2030-01-14", 1n, "2030-01-11"); // move Fri to next Mon
    expect(res.merged).toBe(false);

    const [source] = await db.select().from(deliveries).where(eq(deliveries.id, fri.id));
    expect(source.status).toBe("scheduled");
    expect(source.mergedIntoDeliveryId).toBeNull();
    expect(source.coversDates).toEqual(["2030-01-12", "2030-01-13"]); // Sat + Sun stay on Friday
    expect(source.tiffinUnits).toBe(2);

    const [target] = await db.select().from(deliveries).where(eq(deliveries.deliveryDate, res.carriedOn));
    expect(target.coversDates).toEqual(["2030-01-11"]);
    expect(target.tiffinUnits).toBe(1);
    expect(target.makeupForDeliveryId).toBeNull();
  });

  it("splitting onto an existing scheduled trip merges just the one tiffin", async () => {
    const { fri, wed } = await makeTripOrder(DEP, PFX);
    const res = await rescheduleDelivery(fri.publicId, "2030-01-09", 1n, "2030-01-12"); // Sat -> Wed (already scheduled, covers Wed+Thu)
    expect(res.merged).toBe(true);

    const [source] = await db.select().from(deliveries).where(eq(deliveries.id, fri.id));
    expect(source.coversDates).toEqual(["2030-01-11", "2030-01-13"]);
    expect(source.tiffinUnits).toBe(2);
    expect(source.mergedIntoDeliveryId).toBeNull();

    const [target] = await db.select().from(deliveries).where(eq(deliveries.id, wed.id));
    expect(target.coversDates).toEqual(["2030-01-09", "2030-01-10", "2030-01-12"]);
    expect(target.tiffinUnits).toBe(3);
  });

  it("a swap on the split-off day moves with it; a swap on a remaining day stays on the source", async () => {
    const { fri } = await makeTripOrder(DEP, PFX);
    await db.insert(deliveryCategorySwaps).values([
      { deliveryId: fri.id, fromCategory: "sabzi", toCategory: "dal", qtyFrom: 1, qtyTo: 1, forDate: "2030-01-12" }, // Sat
      { deliveryId: fri.id, fromCategory: "roti", toCategory: "rice", qtyFrom: 1, qtyTo: 1, forDate: "2030-01-13" }, // Sun (stays)
    ]);
    const res = await rescheduleDelivery(fri.publicId, "2030-01-19", 1n, "2030-01-12");

    const sourceSwaps = await db.select().from(deliveryCategorySwaps).where(eq(deliveryCategorySwaps.deliveryId, fri.id));
    expect(sourceSwaps.map((s) => [s.fromCategory, s.forDate])).toEqual([["roti", "2030-01-13"]]);

    const [target] = await db.select().from(deliveries).where(eq(deliveries.deliveryDate, res.carriedOn));
    const targetSwaps = await db.select().from(deliveryCategorySwaps).where(eq(deliveryCategorySwaps.deliveryId, target.id));
    expect(targetSwaps.map((s) => [s.fromCategory, s.forDate])).toEqual([["sabzi", "2030-01-12"]]);
  });

  it("rejects a sourceEatDate that isn't part of this trip", async () => {
    const { fri } = await makeTripOrder(DEP, PFX);
    await expect(rescheduleDelivery(fri.publicId, "2030-01-19", 1n, "2030-01-20")).rejects.toBeInstanceOf(ValidationError);
  });

  it("a single-day trip ignores sourceEatDate and moves the whole trip", async () => {
    const { mon } = await makeTripOrder(DEP, PFX);
    await db.update(deliveries).set({ coversDates: ["2030-01-07"], tiffinUnits: 1 }).where(eq(deliveries.id, mon.id));
    const res = await rescheduleDelivery(mon.publicId, "2030-01-14", 1n, "2030-01-07");
    expect(res.merged).toBe(false);
    const [source] = await db.select().from(deliveries).where(eq(deliveries.id, mon.id));
    expect(source.status).toBe("skipped");
  });
});
