import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, isNull, like } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
vi.mock("@/lib/services/optimoroute/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/optimoroute/client")>();
  return { ...actual, deleteOrder: vi.fn(async () => undefined) };
});
vi.mock("@/lib/services/optimoroute/push", () => ({ pushOneDelivery: vi.fn(async () => undefined) }));

const { db } = await import("@/db/client");
const { deliveries, holidays, orders, organization, subscriptionPauses } = await import("@/db/schema");
const { isOrderFullyPaused, lapsedPauseDates, pauseRows } = await import("../pause-state");
const { lapseAllElapsedPauses, lapseElapsedPauses, listPauseDays, releasePausedDays } = await import("../pause-days.service");
const { getPauseUsage } = await import("../pause-limits.service");
const { adminSetDeliveryStatus, maybeComplete, rescheduleDelivery } = await import("../deliveries.service");
const { makeupSourceIdsForOrder, myActiveSubscriptions, myAgendaDots, myDeliveries } = await import("../customer-deliveries.service");
const { makeTripOrder, resetTrips } = await import("./trip-fixture");

const DEP = "SUB-HOLSEAM001";
const PFX = "tholseam";
const FAR = Date.now() + 1e9;

async function brandOrgId(): Promise<string> {
  const [row] = await db.select({ id: organization.id }).from(organization).where(isNull(organization.parentOrganizationId)).limit(1);
  if (row) return row.id;
  const [made] = await db.insert(organization).values({ name: "Tiffin Grab", clientCode: "TG", parentOrganizationId: null }).returning({ id: organization.id });
  return made!.id;
}
const reset = async () => {
  await resetTrips(DEP, PFX);
  await db.delete(holidays).where(like(holidays.name, `${PFX}%`));
};
/** MWF order from Mon 2030-01-07: Mon [7,8], Wed [9,10], Fri [11,12,13], every cutoff ahead. */
async function orderWithOrg() {
  const made = await makeTripOrder(DEP, PFX);
  const org = await brandOrgId();
  const [order] = await db.update(orders).set({ organizationId: org }).where(eq(orders.id, made.order.id)).returning();
  return { ...made, order: order!, org };
}
/** What a declared holiday leaves on a row, written through the shared row flip. */
async function closeForHoliday(deliveryId: bigint, org: string, date: string) {
  const [holiday] = await db.insert(holidays).values({ organizationId: org, date, name: `${PFX} ${date}` }).returning();
  const flipped = await db.transaction((tx) => pauseRows(tx, [deliveryId], Date.now(), holiday!.id));
  return { holiday: holiday!, flipped };
}
const rowById = async (id: bigint) => (await db.select().from(deliveries).where(eq(deliveries.id, id)))[0]!;

describe("pauseRows", () => {
  beforeEach(reset);
  afterAll(reset);

  it("tags a holiday row whatever the cutoff, never a delivered row; a customer flip still needs the cutoff ahead", async () => {
    const { mon, wed, fri, org } = await orderWithOrg();
    await db.update(deliveries).set({ cutoffAt: Date.now() - 1000 }).where(eq(deliveries.id, wed.id));
    const { holiday, flipped } = await closeForHoliday(wed.id, org, "2030-01-09");
    expect(flipped.map((r) => r.deliveryDate)).toEqual(["2030-01-09"]);
    expect([(await rowById(wed.id)).status, (await rowById(wed.id)).holidayId]).toEqual(["paused", holiday.id]);

    await db.update(deliveries).set({ optimoCompletionStatus: "success" }).where(eq(deliveries.id, fri.id));
    expect(await db.transaction((tx) => pauseRows(tx, [fri.id], Date.now(), holiday.id))).toEqual([]);
    expect((await rowById(fri.id)).status).toBe("scheduled");

    await db.update(deliveries).set({ cutoffAt: Date.now() - 1000 }).where(eq(deliveries.id, mon.id));
    expect(await db.transaction((tx) => pauseRows(tx, [mon.id], Date.now()))).toEqual([]);
    expect((await rowById(mon.id)).status).toBe("scheduled");
  });
});

describe("a holiday row is not a customer pause", () => {
  beforeEach(reset);
  afterAll(reset);

  it("is free: no pause log row, no pause action, no pause day, not a lapsed pause", async () => {
    const { order, wed, org } = await orderWithOrg();
    await closeForHoliday(wed.id, org, "2030-01-09");
    expect(await db.select().from(subscriptionPauses).where(eq(subscriptionPauses.orderId, order.id))).toEqual([]);
    expect(await getPauseUsage(order.id)).toEqual({ count: 0, daysUsed: 0, hasOpenPause: false });
    expect((await lapsedPauseDates(db, [order.id])).get(order.id)).toBeUndefined();
  });

  it("the cutoff converter leaves it paused while a customer pause on the same plan becomes a hold", async () => {
    const { order, mon, wed, org } = await orderWithOrg();
    const { holiday } = await closeForHoliday(wed.id, org, "2030-01-09");
    await db.update(deliveries).set({ cutoffAt: Date.now() - 1000 }).where(eq(deliveries.id, wed.id));
    await db.update(deliveries).set({ status: "paused", cutoffAt: Date.now() - 1000 }).where(eq(deliveries.id, mon.id));

    expect(await lapseElapsedPauses(order.id)).toBe(1);
    await lapseAllElapsedPauses();
    await myActiveSubscriptions(order.userId!);

    expect((await rowById(mon.id)).status).toBe("skipped");
    expect([(await rowById(wed.id)).status, (await rowById(wed.id)).holidayId]).toEqual(["paused", holiday.id]);
  });

  it("Resume refuses it and Resume all skips it", async () => {
    const { order, mon, wed, org } = await orderWithOrg();
    await closeForHoliday(wed.id, org, "2030-01-09");
    await expect(releasePausedDays(order.publicId, ["2030-01-09"], null)).rejects.toThrow("There are no paused days to resume for those dates");

    await db.update(deliveries).set({ status: "paused" }).where(eq(deliveries.id, mon.id));
    expect(await releasePausedDays(order.publicId, "all", null)).toEqual(["2030-01-07"]);
    expect((await rowById(wed.id)).status).toBe("paused");
  });

  it("the pause drawer does not list it", async () => {
    const { order, wed, org } = await orderWithOrg();
    await closeForHoliday(wed.id, org, "2030-01-09");
    expect(await listPauseDays(order.id)).toEqual([{ date: "2030-01-07", paused: false }, { date: "2030-01-11", paused: false }]);
  });

  it("does not make the plan read 'all upcoming days paused'", async () => {
    const { order, fri, org } = await orderWithOrg();
    await db.update(deliveries).set({ status: "paused" }).where(eq(deliveries.id, fri.id));
    expect(await isOrderFullyPaused(db, order.id, "2030-01-10")).toBe(true);
    const [holiday] = await db.insert(holidays).values({ organizationId: org, date: "2030-01-11", name: `${PFX} last` }).returning();
    await db.update(deliveries).set({ holidayId: holiday!.id }).where(eq(deliveries.id, fri.id));
    expect(await isOrderFullyPaused(db, order.id, "2030-01-10")).toBe(false);
  });

  it("maybeComplete: a closed day with its added day is settled; one still waiting for placing keeps the plan open", async () => {
    const { order, mon, wed, fri, org } = await orderWithOrg();
    await db.update(deliveries).set({ deliveryDate: "2020-01-06", cutoffAt: 1 }).where(eq(deliveries.id, mon.id));
    await db.update(deliveries).set({ deliveryDate: "2020-01-08", cutoffAt: 1 }).where(eq(deliveries.id, wed.id));
    await db.update(deliveries).set({ deliveryDate: "2020-01-10", cutoffAt: 1 }).where(eq(deliveries.id, fri.id));
    await closeForHoliday(wed.id, org, "2020-01-08");

    expect(await maybeComplete(order.id)).toBe(false);

    await db.insert(deliveries).values({ orderId: order.id, deliveryDate: "2020-01-13", status: "scheduled", cutoffAt: 1, tiffinUnits: 2, coversDates: ["2020-01-13"], holidayExtraForDeliveryId: wed.id });
    expect(await maybeComplete(order.id)).toBe(true);
    expect((await db.select().from(orders).where(eq(orders.id, order.id)))[0]!.status).toBe("completed");
  });

  it("Move cannot take a paused holiday day; a held day tagged after the fact still moves", async () => {
    const { mon, wed, org } = await orderWithOrg();
    await closeForHoliday(wed.id, org, "2030-01-09");
    await expect(rescheduleDelivery(wed.publicId, "2030-01-16", null, "2030-01-09")).rejects.toThrow("The kitchen is closed that day");

    const [retro] = await db.insert(holidays).values({ organizationId: org, date: "2030-01-07", name: `${PFX} retro` }).returning();
    await db.update(deliveries).set({ status: "skipped", holidayId: retro!.id }).where(eq(deliveries.id, mon.id));
    await expect(rescheduleDelivery(mon.publicId, "2030-01-14", null, "2030-01-07")).resolves.toMatchObject({ carriedOn: "2030-01-14" });
  });

  it("a closed day that has its added day cannot be moved again, tagged or not", async () => {
    const { order, wed } = await orderWithOrg();
    await db.update(deliveries).set({ status: "skipped" }).where(eq(deliveries.id, wed.id));
    await db.insert(deliveries).values({ orderId: order.id, deliveryDate: "2030-01-14", status: "scheduled", cutoffAt: FAR, tiffinUnits: 1, coversDates: ["2030-01-14"], holidayExtraForDeliveryId: wed.id });
    await expect(rescheduleDelivery(wed.publicId, "2030-01-16", null, "2030-01-09")).rejects.toThrow("This delivery has already been rescheduled");
  });

  it("the admin status select cannot change it", async () => {
    const { wed, org } = await orderWithOrg();
    const { holiday } = await closeForHoliday(wed.id, org, "2030-01-09");
    for (const status of ["upcoming", "delivered", "not_delivered"] as const) {
      await expect(adminSetDeliveryStatus(wed.publicId, status, null)).rejects.toThrow("The kitchen is closed that day");
    }
    expect([(await rowById(wed.id)).status, (await rowById(wed.id)).holidayId]).toEqual(["paused", holiday.id]);
  });

  it("an order still marked paused is retired to active with its holiday day untouched", async () => {
    const { order, wed, org } = await orderWithOrg();
    const { holiday } = await closeForHoliday(wed.id, org, "2030-01-09");
    await db.update(orders).set({ status: "paused" }).where(eq(orders.id, order.id));
    await lapseElapsedPauses(order.id);
    expect((await db.select().from(orders).where(eq(orders.id, order.id)))[0]!.status).toBe("active");
    expect([(await rowById(wed.id)).status, (await rowById(wed.id)).holidayId]).toEqual(["paused", holiday.id]);
  });
});

describe("customer reads carry the holiday", () => {
  beforeEach(reset);
  afterAll(reset);

  it("names it on a paused day and on a held day that was already moved, and says where the tiffin went", async () => {
    const { order, mon, wed, org } = await orderWithOrg();
    const { holiday } = await closeForHoliday(wed.id, org, "2030-01-09");
    await db.insert(deliveries).values({ orderId: order.id, deliveryDate: "2030-01-14", status: "scheduled", cutoffAt: FAR, tiffinUnits: 1, coversDates: ["2030-01-14"], holidayExtraForDeliveryId: wed.id });
    const [retro] = await db.insert(holidays).values({ organizationId: org, date: "2030-01-07", name: `${PFX} retro` }).returning();
    await db.update(deliveries).set({ status: "skipped", holidayId: retro!.id }).where(eq(deliveries.id, mon.id));
    await db.insert(deliveries).values({ orderId: order.id, deliveryDate: "2030-01-16", status: "scheduled", cutoffAt: FAR, tiffinUnits: 2, coversDates: ["2030-01-07", "2030-01-08"], makeupForDeliveryId: mon.id });

    const rows = await myDeliveries(order.userId!, "2030-01-06", "2030-01-20");
    expect(rows.find((r) => r.id === wed.id)!.holidayName).toBe(holiday.name);
    expect(rows.find((r) => r.id === mon.id)!.holidayName).toBe(retro!.name);
    expect(rows.find((r) => r.deliveryDate === "2030-01-14")!.holidayName ?? null).toBeNull();

    const dots = await myAgendaDots(order.userId!, "2030-01-06", "2030-01-20");
    expect(dots["2030-01-09"]!.map((d) => [d.holiday, d.truck])).toEqual([[holiday.name, false]]);
    expect(dots["2030-01-10"]!.map((d) => d.holiday)).toEqual([holiday.name]);
    // The make-up also eats on the 7th; the closed day's own dot comes first and decides the day's colour.
    expect(dots["2030-01-07"]![0]!.holiday).toBe(retro!.name);

    const moved = await makeupSourceIdsForOrder(order.publicId);
    expect([moved.get(wed.id.toString()), moved.get(mon.id.toString())]).toEqual(["2030-01-14", "2030-01-16"]);
  });
});
