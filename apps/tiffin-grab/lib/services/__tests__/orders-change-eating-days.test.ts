// Admin changes a plan's eating days: delivery days and the tiffin balance stay, open
// deliveries are laid out again around the rows that can't move.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { asc, eq } from "drizzle-orm";
import type { DayOfWeek } from "@/lib/menu/delivery-days";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
const weekend = vi.hoisted(() => ({ serves: true }));
vi.mock("../weekend-dish", () => ({ mealSizeServesWeekends: async () => weekend.serves }));

const { db } = await import("@/db/client");
const { deliveries, orderActivities, orders } = await import("@/db/schema");
const { changeOrderEatingDays } = await import("../orders.service");
const { makeTripOrder, resetTrips } = await import("./trip-fixture");

const DEPLOYMENT = "test-eating-days";
const PREFIX = "eatdays-";
const MON_FRI: DayOfWeek[] = ["mon", "tue", "wed", "thu", "fri"];

// 5-day plan from Mon 2030-01-07 eating Mon-Fri: 10 tiffins = 10 deliveries over 2 weeks.
const make = () => makeTripOrder(DEPLOYMENT, PREFIX, 1, "5_day", 2, { days: MON_FRI, tiffinCount: 10 });
const scheduled = async (orderId: bigint) =>
  (await db.select().from(deliveries).where(eq(deliveries.orderId, orderId)).orderBy(asc(deliveries.deliveryDate))).filter((r) => r.status === "scheduled");
const units = (rows: { tiffinUnits: number }[]) => rows.reduce((n, r) => n + r.tiffinUnits, 0);

beforeEach(async () => {
  weekend.serves = true;
  await resetTrips(DEPLOYMENT, PREFIX);
});
afterAll(() => resetTrips(DEPLOYMENT, PREFIX));

describe("changeEatingDays", () => {
  it("adding Saturday puts it on Friday's delivery and ends the plan sooner", async () => {
    const { order } = await make();
    await changeOrderEatingDays(order.publicId, [...MON_FRI, "sat"]);

    const rows = await scheduled(order.id);
    expect(units(rows)).toBe(10);
    expect(rows.map((r) => r.deliveryDate)).toEqual([
      "2030-01-07", "2030-01-08", "2030-01-09", "2030-01-10", "2030-01-11",
      "2030-01-14", "2030-01-15", "2030-01-16", "2030-01-17",
    ]);
    const fri = rows.find((r) => r.deliveryDate === "2030-01-11")!;
    expect(fri.tiffinUnits).toBe(2);
    expect(fri.coversDates).toEqual(["2030-01-11", "2030-01-12"]);

    const [after] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(after.eatingDays).toEqual([...MON_FRI, "sat"]);
    expect(after.tiffinCount).toBe(10);
    const notes = await db.select().from(orderActivities).where(eq(orderActivities.orderId, order.id));
    expect(notes.some((n) => n.note?.includes("Eating days changed from Mon, Tue, Wed, Thu, Fri to Mon, Tue, Wed, Thu, Fri, Sat"))).toBe(true);
  });

  it("dropping days keeps the balance and runs the plan longer", async () => {
    const { order } = await make();
    await changeOrderEatingDays(order.publicId, ["mon", "wed", "fri"]);

    const rows = await scheduled(order.id);
    expect(units(rows)).toBe(10);
    expect(rows).toHaveLength(10);
    expect(rows.at(-1)!.deliveryDate).toBe("2030-01-28");
    expect(rows.every((r) => r.tiffinUnits === 1)).toBe(true);
    const [after] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(after.durationWeeks).toBe(4);
  });

  it("leaves a held delivery where it is and lays the rest around it", async () => {
    const { order, wed } = await make();
    await db.update(deliveries).set({ status: "skipped" }).where(eq(deliveries.id, wed.id));
    await changeOrderEatingDays(order.publicId, [...MON_FRI, "sat"]);

    const [held] = await db.select().from(deliveries).where(eq(deliveries.id, wed.id));
    expect(held).toMatchObject({ status: "skipped", deliveryDate: "2030-01-09" });
    const rows = await scheduled(order.id);
    expect(units(rows)).toBe(9);
    expect(rows.some((r) => r.deliveryDate === "2030-01-09")).toBe(false);
  });

  it("refuses a weekend day when the meal has no weekend dish", async () => {
    const { order } = await make();
    weekend.serves = false;
    await expect(changeOrderEatingDays(order.publicId, [...MON_FRI, "sat"])).rejects.toThrow(/no weekend dish/);
    expect(await scheduled(order.id)).toHaveLength(10);
  });
});
