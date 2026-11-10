// Staff may force a start date past the cutoff; without force the cutoff still refuses it.
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, asc, eq, like } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { deliveries, orderActivities } = await import("@/db/schema");
const { ordersService } = await import("../orders.service");
const { makeTripOrder, resetTrips } = await import("./trip-fixture");

const DEPLOYMENT = "test-force-start";
const PREFIX = "forcestart-";
// Sun 2030-01-13, 23:30 in Toronto: Monday's cutoff has passed whatever the cutoff hour.
const SUNDAY_LATE = new Date("2030-01-14T04:30:00Z");

beforeEach(() => resetTrips(DEPLOYMENT, PREFIX));
afterEach(() => vi.useRealTimers());
afterAll(() => resetTrips(DEPLOYMENT, PREFIX));

describe("changeStartDate force", () => {
  it("moves the start onto a day past its cutoff only when forced", async () => {
    const { order } = await makeTripOrder(DEPLOYMENT, PREFIX, 1, "5_day", 1, { days: ["mon", "tue", "wed", "thu", "fri"], tiffinCount: 5 });
    await ordersService.changeStartDate(order.publicId, "2030-01-21");

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(SUNDAY_LATE);
    await expect(ordersService.changeStartDate(order.publicId, "2030-01-14")).rejects.toThrow();
    await ordersService.changeStartDate(order.publicId, "2030-01-14", { force: true });

    const rows = await db.select().from(deliveries).where(eq(deliveries.orderId, order.id)).orderBy(asc(deliveries.deliveryDate));
    expect(rows[0]!.deliveryDate).toBe("2030-01-14");
    const notes = await db.select({ note: orderActivities.note }).from(orderActivities)
      .where(and(eq(orderActivities.orderId, order.id), like(orderActivities.note, "%forced past cutoff%")));
    expect(notes).toHaveLength(1);
  });
});
