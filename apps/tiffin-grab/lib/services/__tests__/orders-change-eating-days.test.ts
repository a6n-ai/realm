// Admin changes a plan's eating days: delivery days and the tiffin balance stay, open
// deliveries are laid out again around the rows that can't move.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { asc, eq, inArray } from "drizzle-orm";
import type { DayOfWeek } from "@/lib/menu/delivery-days";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
const weekend = vi.hoisted(() => ({ serves: true }));
vi.mock("../weekend-dish", () => ({ mealSizeServesWeekends: async () => weekend.serves }));

const { db } = await import("@/db/client");
const { deliveries, deliveryFrequencies, deliveryMoves, orderActivities, orders } = await import("@/db/schema");
const { changeOrderEatingDays, changeOrderStartDate } = await import("../orders.service");
const { makeTripOrder, resetTrips } = await import("./trip-fixture");

const DEPLOYMENT = "test-eating-days";
const PREFIX = "eatdays-";
const MON_FRI: DayOfWeek[] = ["mon", "tue", "wed", "thu", "fri"];
const WP = "wc-test-eating-days";
const WP_PREFIX = "wpdays-";

// 5-day plan from Mon 2030-01-07 eating Mon-Fri: 10 tiffins = 10 deliveries over 2 weeks.
const make = () => makeTripOrder(DEPLOYMENT, PREFIX, 1, "5_day", 2, { days: MON_FRI, tiffinCount: 10 });
const scheduled = async (orderId: bigint) =>
  (await db.select().from(deliveries).where(eq(deliveries.orderId, orderId)).orderBy(asc(deliveries.deliveryDate))).filter((r) => r.status === "scheduled");
const units = (rows: { tiffinUnits: number }[]) => rows.reduce((n, r) => n + r.tiffinUnits, 0);

beforeEach(async () => {
  weekend.serves = true;
  await resetTrips(WP, WP_PREFIX);
  await resetTrips(DEPLOYMENT, PREFIX);
});
afterAll(async () => { await resetTrips(DEPLOYMENT, PREFIX); await resetTrips(WP, WP_PREFIX); });

describe("changeEatingDays", () => {
  it("the start date can still move after the eating days changed", async () => {
    const { order } = await make();
    // 10 tiffins on 3 days a week run 4 weeks: whole weeks x days (12) is no longer what was bought.
    await changeOrderEatingDays(order.publicId, ["mon", "wed", "fri"]);

    await changeOrderStartDate(order.publicId, "2030-01-14");

    const rows = await scheduled(order.id);
    expect(units(rows)).toBe(10);
    expect(rows[0].deliveryDate).toBe("2030-01-14");
    expect(rows.at(-1)!.deliveryDate).toBe("2030-02-04");
    const [after] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect([after.startDate, after.tiffinCount, after.durationWeeks]).toEqual(["2030-01-14", 10, 4]);
  });

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

  it("lays tiffins on days a trimmed plan cancelled, not around them", async () => {
    const { order } = await make();
    const rows = await scheduled(order.id);
    const voided = rows.filter((r) => r.deliveryDate === "2030-01-14" || r.deliveryDate === "2030-01-16").map((r) => r.id);
    await db.update(deliveries).set({ status: "cancelled" }).where(inArray(deliveries.id, voided));
    await changeOrderEatingDays(order.publicId, ["mon", "wed", "fri"]);

    const after = await scheduled(order.id);
    expect(after.map((r) => r.deliveryDate)).toEqual([
      "2030-01-07", "2030-01-09", "2030-01-11", "2030-01-14", "2030-01-16", "2030-01-18", "2030-01-21", "2030-01-23",
    ]);
    const all = await db.select().from(deliveries).where(eq(deliveries.orderId, order.id));
    expect(all.filter((r) => r.status === "cancelled")).toHaveLength(0);
  });

  it("brings a moved tiffin left after the new last day forward to follow it", async () => {
    const { order, wed } = await make();
    await db.update(deliveries).set({ status: "skipped" }).where(eq(deliveries.id, wed.id));
    const [moved] = await db.insert(deliveries).values({
      orderId: order.id, deliveryDate: "2030-01-21", status: "scheduled", cutoffAt: Date.UTC(2030, 0, 20),
      tiffinUnits: 1, coversDates: ["2030-01-21"], makeupForDeliveryId: wed.id,
    }).returning();
    await changeOrderEatingDays(order.publicId, [...MON_FRI, "sat"]);

    const [after] = await db.select().from(deliveries).where(eq(deliveries.id, moved.id));
    expect(after).toMatchObject({ deliveryDate: "2030-01-18", coversDates: ["2030-01-18"], makeupForDeliveryId: wed.id });
    expect(units(await scheduled(order.id))).toBe(10);
    const notes = await db.select().from(orderActivities).where(eq(orderActivities.orderId, order.id));
    expect(notes.some((n) => n.note?.includes("1 moved tiffin brought forward, last delivery 2030-01-18"))).toBe(true);
  });

  it("cancelled days past the plan don't stop a moved tiffin coming forward", async () => {
    const { order, wed } = await make();
    await db.update(deliveries).set({ status: "skipped" }).where(eq(deliveries.id, wed.id));
    // A trimmed plan: its old tail days stay as cancelled rows; a recorded move keeps them from being dropped.
    const tail = await db.insert(deliveries).values(["2030-01-22", "2030-01-23"].map((d) => ({
      orderId: order.id, deliveryDate: d, status: "cancelled" as const, cutoffAt: Date.UTC(2030, 0, 20), tiffinUnits: 1, coversDates: [d],
    }))).returning();
    const [moved] = await db.insert(deliveries).values({
      orderId: order.id, deliveryDate: "2030-01-24", status: "scheduled", cutoffAt: Date.UTC(2030, 0, 23),
      tiffinUnits: 1, coversDates: ["2030-01-24"], makeupForDeliveryId: wed.id,
    }).returning();
    await db.insert(deliveryMoves).values(tail.map((r) => ({ orderId: order.id, fromDeliveryId: r.id, toDeliveryId: moved.id, fromEatDate: r.deliveryDate, toEatDate: "2030-01-24" })));
    await changeOrderEatingDays(order.publicId, [...MON_FRI, "sat"]);

    const [after] = await db.select().from(deliveries).where(eq(deliveries.id, moved.id));
    expect(after).toMatchObject({ deliveryDate: "2030-01-18", coversDates: ["2030-01-18"] });
  });

  it("refuses a weekend day when the meal has no weekend dish", async () => {
    const { order } = await make();
    weekend.serves = false;
    await expect(changeOrderEatingDays(order.publicId, [...MON_FRI, "sat"])).rejects.toThrow(/no weekend dish/);
    expect(await scheduled(order.id)).toHaveLength(10);
  });

  it("a WordPress plan imported as MWF moves to 5-day delivery on save, even with the same days", async () => {
    const { order } = await makeTripOrder(WP, WP_PREFIX, 1, "mwf", 2, { days: MON_FRI, tiffinCount: 10 });
    expect(units(await scheduled(order.id))).toBe(10);

    await changeOrderEatingDays(order.publicId, MON_FRI);

    const rows = await scheduled(order.id);
    expect(units(rows)).toBe(10);
    expect(rows.every((r) => r.tiffinUnits === 1 && r.coversDates?.join() === r.deliveryDate)).toBe(true);
    const [after] = await db.select({ key: deliveryFrequencies.key }).from(orders)
      .innerJoin(deliveryFrequencies, eq(orders.frequencyId, deliveryFrequencies.id)).where(eq(orders.id, order.id));
    expect(after!.key).toBe("5_day");
    const notes = await db.select({ note: orderActivities.note }).from(orderActivities).where(eq(orderActivities.orderId, order.id));
    expect(notes.some((n) => n.note?.startsWith("Delivery moved to 5 days a week"))).toBe(true);
  });

  it("a non-WordPress MWF plan keeps its frequency: same days is a no-op", async () => {
    const { order } = await makeTripOrder(DEPLOYMENT, PREFIX, 1, "mwf", 2, { days: MON_FRI, tiffinCount: 10 });
    const before = (await scheduled(order.id)).map((r) => r.id);
    await changeOrderEatingDays(order.publicId, MON_FRI);
    expect((await scheduled(order.id)).map((r) => r.id)).toEqual(before);
  });
});
