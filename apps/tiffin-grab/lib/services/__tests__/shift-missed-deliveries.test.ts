import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { deliveries } = await import("@/db/schema");
const { shiftMissedDeliveries } = await import("../deliveries.service");
const { makeTripOrder, resetTrips } = await import("./trip-fixture");

const DEP = "SUB-SHIFTMISS01";
const PFX = "tshift";
const reset = () => resetTrips(DEP, PFX);

describe("shiftMissedDeliveries", () => {
  beforeEach(reset);
  afterAll(reset);

  it("a day missed while unpaid becomes the target day's tiffin, not the old day's menu", async () => {
    const { order, mon } = await makeTripOrder(DEP, PFX, 1, "5_day", 1, { days: ["mon", "tue", "wed", "thu", "fri"], tiffinCount: 5 });
    await db.update(deliveries).set({ deliveryDate: "2020-01-06", coversDates: ["2020-01-06"] }).where(eq(deliveries.id, mon.id));

    await db.transaction((tx) => shiftMissedDeliveries(tx, order.id, null));

    const [moved] = await db.select().from(deliveries)
      .where(and(eq(deliveries.orderId, order.id), eq(deliveries.makeupForDeliveryId, mon.id)));
    expect(moved.deliveryDate).toBe("2030-01-14");
    expect(moved.coversDates).toEqual(["2030-01-14"]);
    expect(moved.tiffinUnits).toBe(1);
  });
});
