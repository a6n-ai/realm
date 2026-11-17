// Moving the start of a plan the customer already paused keeps those pauses by date;
// a paused date the new schedule no longer delivers goes back to the hold budget.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { asc, eq } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { deliveries, subscriptionPauses } = await import("@/db/schema");
const { ordersService } = await import("../orders.service");
const { pauseDays } = await import("@/lib/deliveries/pause-days.service");
const { getPauseUsage } = await import("@/lib/deliveries/pause-limits.service");
const { makeTripOrder, resetTrips } = await import("../../services/__tests__/trip-fixture");

const DEPLOYMENT = "test-start-carry-pauses";
const PREFIX = "startcarry-";

beforeEach(() => resetTrips(DEPLOYMENT, PREFIX));
afterAll(() => resetTrips(DEPLOYMENT, PREFIX));

describe("changeStartDate with customer pauses", () => {
  it("re-pauses kept dates and refunds dropped ones", async () => {
    const { order } = await makeTripOrder(DEPLOYMENT, PREFIX, 1, "5_day", 2, { days: ["mon", "tue", "wed", "thu", "fri"], tiffinCount: 10 });
    await pauseDays(order.publicId, ["2030-01-09", "2030-01-16"], null);
    expect((await getPauseUsage(order.id)).daysUsed).toBe(2);

    expect(await ordersService.startChangeBlocker(order.id, "active")).toBeNull();
    expect(await ordersService.customerStartChange(order.publicId)).toMatchObject({ startDate: "2030-01-07", blockedReason: null });
    await ordersService.changeStartDate(order.publicId, "2030-01-14");

    const rows = await db.select({ date: deliveries.deliveryDate, status: deliveries.status })
      .from(deliveries).where(eq(deliveries.orderId, order.id)).orderBy(asc(deliveries.deliveryDate));
    expect(rows[0]!.date).toBe("2030-01-14");
    expect(rows.filter((r) => r.status === "paused").map((r) => r.date)).toEqual(["2030-01-16"]);
    expect(rows).toHaveLength(10);

    const [log] = await db.select({ releasedDates: subscriptionPauses.releasedDates }).from(subscriptionPauses)
      .where(eq(subscriptionPauses.orderId, order.id));
    expect(log!.releasedDates).toEqual(["2030-01-09"]);
    expect((await getPauseUsage(order.id)).daysUsed).toBe(1);
  });
});
