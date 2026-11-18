// Moving the start of a plan the customer already paused keeps those pauses by date;
// a paused date the new schedule no longer delivers goes back to the hold budget.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { asc, eq } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { deliveries, deliveryMoves, subscriptionPauses } = await import("@/db/schema");
const { ordersService, START_PAST_CUTOFF, START_PUSHED_TO_OPTIMO } = await import("../orders.service");
const { pauseDays } = await import("@/lib/deliveries/pause-days.service");
const { rescheduleDelivery } = await import("@/lib/deliveries/deliveries.service");
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

  it("staff reset moves the start after a customer move and wipes the move", async () => {
    const { order, wed } = await makeTripOrder(DEPLOYMENT, PREFIX);
    await rescheduleDelivery(wed.publicId, "2030-01-21", null, "2030-01-09", 1);

    await expect(ordersService.changeStartDate(order.publicId, "2030-01-14")).rejects.toThrow("already changed");
    expect(await ordersService.startChangeBlocker(order.id, "active", db, true)).toBeNull();
    await ordersService.changeStartDate(order.publicId, "2030-01-14", { reset: true });

    const rows = await db.select({ date: deliveries.deliveryDate }).from(deliveries).where(eq(deliveries.orderId, order.id)).orderBy(asc(deliveries.deliveryDate));
    expect(rows[0]!.date).toBe("2030-01-14");
    expect(await db.select().from(deliveryMoves).where(eq(deliveryMoves.orderId, order.id))).toHaveLength(0);
  });

  it("staff can move a start past its cutoff until the day is pushed to OptimoRoute", async () => {
    const { order } = await makeTripOrder(DEPLOYMENT, PREFIX);
    await db.update(deliveries).set({ cutoffAt: Date.now() - 60_000 }).where(eq(deliveries.orderId, order.id));
    expect(await ordersService.startChangeBlocker(order.id, "active")).toBe(START_PAST_CUTOFF);
    expect(await ordersService.startChangeBlocker(order.id, "active", db, true)).toBeNull();

    await db.update(deliveries).set({ routeSyncedAt: Date.now() }).where(eq(deliveries.orderId, order.id));
    expect(await ordersService.startChangeBlocker(order.id, "active", db, true)).toBe(START_PUSHED_TO_OPTIMO);
    await expect(ordersService.changeStartDate(order.publicId, "2030-01-14", { reset: true })).rejects.toThrow("OptimoRoute");

    await db.update(deliveries).set({ routeSyncedAt: null }).where(eq(deliveries.orderId, order.id));
    await ordersService.changeStartDate(order.publicId, "2030-01-14", { reset: true });
    const [first] = await db.select({ date: deliveries.deliveryDate }).from(deliveries).where(eq(deliveries.orderId, order.id)).orderBy(asc(deliveries.deliveryDate)).limit(1);
    expect(first!.date).toBe("2030-01-14");
  });
});
