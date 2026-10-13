import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, asc, eq, isNull, like, sql } from "drizzle-orm";
import { cutoffMsFor } from "@foundry/commons";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
vi.mock("@/lib/services/optimoroute/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/optimoroute/client")>();
  return { ...actual, deleteOrder: vi.fn(async () => undefined) };
});
vi.mock("@/lib/services/optimoroute/push", () => ({ pushOneDelivery: vi.fn(async () => undefined) }));

const { db } = await import("@/db/client");
const { deliveries, deliveryFrequencies, holidays, orderActivities, orders, organization, subscriptionPauses } = await import("@/db/schema");
const { getAppSettings } = await import("../app-settings.service");
const { applyHolidaysToOrder, placeHolidayExtras, undoHolidayForOrder } = await import("../holiday-apply");
const { grantComplimentaryTiffin, redeliverTrip, rescheduleDelivery } = await import("../deliveries.service");
const { makeTripOrder, resetTrips } = await import("./trip-fixture");

type Delivery = typeof deliveries.$inferSelect;
const DEP = "SUB-HOLAPPLY01";
const DEP2 = "SUB-HOLAPPLY02";
const PFX = "tholapply";
const FAR = Date.now() + 1e9;

async function brandOrgId(): Promise<string> {
  const [row] = await db.select({ id: organization.id }).from(organization).where(isNull(organization.parentOrganizationId)).limit(1);
  if (row) return row.id;
  const [made] = await db.insert(organization).values({ name: "Tiffin Grab", clientCode: "TG", parentOrganizationId: null }).returning({ id: organization.id });
  return made!.id;
}
const reset = async () => {
  // DEP2 shares DEP's customer in one test: clear its order first, without touching users.
  await resetTrips(DEP2, "nomatch-");
  await resetTrips(DEP, PFX);
  await db.delete(holidays).where(like(holidays.name, `${PFX}%`));
};
/** mwf: Mon [7,8], Wed [9,10], Fri [11,12,13]. 5_day: Mon..Thu one day each, Fri [11,12,13]. All from Mon 2030-01-07. */
async function orderWithOrg(frequencyKey: "mwf" | "5_day" = "mwf") {
  const made = await makeTripOrder(DEP, PFX, 1, frequencyKey);
  const org = await brandOrgId();
  const [order] = await db.update(orders).set({ organizationId: org }).where(eq(orders.id, made.order.id)).returning();
  return { ...made, order: order!, org };
}
const addHoliday = async (org: string, date: string, label = date) =>
  (await db.insert(holidays).values({ organizationId: org, date, name: `${PFX} ${label}` }).returning())[0]!;
const locked = <T>(orderId: bigint, run: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0], order: typeof orders.$inferSelect) => Promise<T>) =>
  db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${orderId})`);
    const [fresh] = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    return run(tx, fresh!);
  });
const apply = (order: { id: bigint }) => locked(order.id, (tx, fresh) => applyHolidaysToOrder(tx, fresh, 1n));
const undo = (orderId: bigint, holidayId: bigint) => locked(orderId, (tx) => undoHolidayForOrder(tx, orderId, holidayId, 1n));
const rowsOf = (orderId: bigint) => db.select().from(deliveries).where(eq(deliveries.orderId, orderId)).orderBy(asc(deliveries.deliveryDate));
const shape = async (orderId: bigint) => (await rowsOf(orderId)).map((r) => [r.deliveryDate, r.status, r.tiffinUnits]);
const rowById = async (id: bigint) => (await db.select().from(deliveries).where(eq(deliveries.id, id)))[0]!;
const extrasOf = async (orderId: bigint, sourceId: bigint) => (await rowsOf(orderId)).filter((r) => r.holidayExtraForDeliveryId === sourceId);

describe("applyHolidaysToOrder", () => {
  beforeEach(reset);
  afterAll(reset);

  it("pauses the day, tags it and adds one ordinary delivery per eating day after the plan's last delivery", async () => {
    const { order, wed, org } = await orderWithOrg();
    const h = await addHoliday(org, "2030-01-09");

    const applied = await apply(order);

    expect(applied).toEqual([{ deliveryPublicId: wed.publicId, routeSyncedAt: null, date: "2030-01-09", holidayId: h.id, holidayName: h.name, extraDates: ["2030-01-14", "2030-01-16"], needsPlacing: null }]);
    expect(await shape(order.id)).toEqual([
      ["2030-01-07", "scheduled", 2], ["2030-01-09", "paused", 2], ["2030-01-11", "scheduled", 3], ["2030-01-14", "scheduled", 1], ["2030-01-16", "scheduled", 1],
    ]);
    expect((await rowById(wed.id)).holidayId).toBe(h.id);
    for (const extra of await extrasOf(order.id, wed.id)) {
      expect([extra.makeupForDeliveryId, extra.holidayId, extra.coversDates, extra.organizationId]).toEqual([null, null, [extra.deliveryDate], org]);
    }
    // Free for the customer: no pause log, order status untouched.
    expect(await db.select().from(subscriptionPauses).where(eq(subscriptionPauses.orderId, order.id))).toEqual([]);
    expect((await db.select().from(orders).where(eq(orders.id, order.id)))[0]!.status).toBe("active");
    const acts = await db.select().from(orderActivities).where(eq(orderActivities.deliveryId, wed.id));
    expect(acts.map((a) => [a.type, a.note, a.createdBy])).toEqual([["note", `Holiday (${h.name}): 2030-01-09 closed, added 2030-01-14, 2030-01-16`, 1n]]);
  });

  it("a second run changes nothing", async () => {
    const { order, org } = await orderWithOrg();
    await addHoliday(org, "2030-01-09");
    await apply(order);
    const before = await shape(order.id);
    expect(await apply(order)).toEqual([]);
    expect(await shape(order.id)).toEqual(before);
  });

  it("a holiday on the plan's last day adds the extras after it", async () => {
    const { order, fri, org } = await orderWithOrg();
    await addHoliday(org, "2030-01-11");
    const [res] = await apply(order);
    expect(res!.extraDates).toEqual(["2030-01-14", "2030-01-16", "2030-01-18"]);
    expect((await rowById(fri.id)).status).toBe("paused");
    expect((await extrasOf(order.id, fri.id)).reduce((n, r) => n + r.tiffinUnits, 0)).toBe(fri.tiffinUnits);
  });

  it("two holidays in one pass land on consecutive free plan days", async () => {
    const { order, org } = await orderWithOrg();
    await addHoliday(org, "2030-01-09");
    await addHoliday(org, "2030-01-11");
    expect((await apply(order)).map((a) => a.extraDates)).toEqual([["2030-01-14", "2030-01-16"], ["2030-01-18", "2030-01-21", "2030-01-23"]]);
  });

  it("steps past another holiday and a date this plan already holds a row on", async () => {
    const { order, org } = await orderWithOrg();
    await addHoliday(org, "2030-01-09");
    await addHoliday(org, "2030-01-14");
    await db.insert(deliveries).values({ orderId: order.id, deliveryDate: "2030-01-16", status: "cancelled", cutoffAt: FAR, tiffinUnits: 1, coversDates: ["2030-01-16"] });
    const [res] = await apply(order);
    expect(res!.extraDates).toEqual(["2030-01-18", "2030-01-21"]);
  });

  it("steps past a day whose cutoff has already passed", async () => {
    const { order, org } = await orderWithOrg("5_day");
    const { cutoffHour, timezone } = await getAppSettings();
    // The plan now ends on Thursday the 10th, the holiday.
    await db.delete(deliveries).where(and(eq(deliveries.orderId, order.id), eq(deliveries.deliveryDate, "2030-01-11")));
    await addHoliday(org, "2030-01-10");
    // Thursday evening, one minute after Friday's cutoff: today is still the 10th and Friday is closed for changes.
    vi.useFakeTimers({ toFake: ["Date"], now: cutoffMsFor("2030-01-11", cutoffHour, timezone) + 60_000 });
    try {
      const [res] = await apply(order);
      expect(res!.extraDates).toEqual(["2030-01-14"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("leaves a delivered day, a customer-paused day, a moved-away day and an order with no organization alone", async () => {
    const { order, wed, org } = await orderWithOrg();
    await addHoliday(org, "2030-01-09");
    const untouched = async (status: string) => {
      expect(await apply(order), status).toEqual([]);
      const row = await rowById(wed.id);
      expect([row.status, row.holidayId], status).toEqual([status, null]);
      expect(await extrasOf(order.id, wed.id), status).toEqual([]);
    };

    await db.update(deliveries).set({ optimoCompletionStatus: "success" }).where(eq(deliveries.id, wed.id));
    await untouched("scheduled");

    await db.update(deliveries).set({ optimoCompletionStatus: null, status: "paused" }).where(eq(deliveries.id, wed.id));
    await untouched("paused");

    await db.update(deliveries).set({ status: "skipped" }).where(eq(deliveries.id, wed.id));
    await db.insert(deliveries).values({ orderId: order.id, deliveryDate: "2030-01-14", status: "scheduled", cutoffAt: FAR, tiffinUnits: 2, coversDates: ["2030-01-09", "2030-01-10"], makeupForDeliveryId: wed.id });
    await untouched("skipped");

    await db.delete(deliveries).where(eq(deliveries.makeupForDeliveryId, wed.id));
    await db.update(deliveries).set({ status: "scheduled" }).where(eq(deliveries.id, wed.id));
    await db.update(orders).set({ organizationId: null }).where(eq(orders.id, order.id));
    await untouched("scheduled");
  });

  it("does not auto-place when the extra day would fall inside the customer's next plan", async () => {
    const { order, wed, org } = await orderWithOrg();
    // The renewal: same customer, starts the Monday after this plan's last delivery.
    const next = await makeTripOrder(DEP2, PFX);
    await db.delete(deliveries).where(eq(deliveries.orderId, next.order.id));
    await db.update(orders).set({ userId: order.userId, startDate: "2030-01-14", organizationId: org }).where(eq(orders.id, next.order.id));
    const h = await addHoliday(org, "2030-01-09");

    const [res] = await apply(order);

    expect([res!.extraDates, res!.needsPlacing]).toEqual([[], "another plan runs on Mon, Jan 14"]);
    expect([(await rowById(wed.id)).status, (await rowById(wed.id)).holidayId]).toEqual(["paused", h.id]);
    expect(await extrasOf(order.id, wed.id)).toEqual([]);
    const [act] = await db.select().from(orderActivities).where(eq(orderActivities.deliveryId, wed.id));
    expect(act!.note).toBe(`Holiday (${h.name}): 2030-01-09 closed. Extra day needs placing: another plan runs on Mon, Jan 14`);
  });

  it("a trial is closed like everyone but gets no extra day", async () => {
    const { order, wed, org } = await orderWithOrg();
    await db.update(orders).set({ trialLength: 3, trialWeekdays: ["mon", "wed", "fri"] }).where(eq(orders.id, order.id));
    await addHoliday(org, "2030-01-09");
    const [res] = await apply(order);
    expect([res!.extraDates, res!.needsPlacing]).toEqual([[], "trial"]);
    expect((await rowById(wed.id)).status).toBe("paused");
    expect(await extrasOf(order.id, wed.id)).toEqual([]);
  });

  it("a plan with no weekday to deliver on is still closed, and waits for staff", async () => {
    const { order, wed, org } = await orderWithOrg();
    await addHoliday(org, "2030-01-09");
    const [none] = await db.insert(deliveryFrequencies).values({ key: `${PFX}_none`, name: `${PFX} none`, daysPerWeek: 1, weekdays: ["sat"] }).returning();
    await db.update(orders).set({ frequencyId: none!.id, eatingDays: null }).where(eq(orders.id, order.id));
    try {
      const [res] = await apply(order);
      expect([res!.extraDates, res!.needsPlacing]).toEqual([[], "no free delivery day found"]);
      expect((await rowById(wed.id)).status).toBe("paused");
    } finally {
      await db.update(orders).set({ frequencyId: order.frequencyId }).where(eq(orders.id, order.id));
      await db.delete(deliveryFrequencies).where(eq(deliveryFrequencies.id, none!.id));
    }
  });
});

describe("undoHolidayForOrder", () => {
  beforeEach(reset);
  afterAll(reset);

  it("puts an untouched day back and deletes its added days", async () => {
    const { order, wed, org } = await orderWithOrg();
    const h = await addHoliday(org, "2030-01-09");
    await apply(order);

    const res = await undo(order.id, h.id);

    expect([res.restored, res.left, res.stops.length]).toEqual([["2030-01-09"], [], 2]);
    expect(await shape(order.id)).toEqual([["2030-01-07", "scheduled", 2], ["2030-01-09", "scheduled", 2], ["2030-01-11", "scheduled", 3]]);
    expect((await rowById(wed.id)).holidayId).toBeNull();
  });

  it("undo keeps the extra day once the customer paused, moved or re-addressed it", async () => {
    const changes: Record<string, (extra: Delivery) => Promise<unknown>> = {
      paused: (e) => db.update(deliveries).set({ status: "paused" }).where(eq(deliveries.id, e.id)),
      moved: (e) => rescheduleDelivery(e.publicId, "2030-01-18", 1n),
      "re-addressed": (e) => db.update(deliveries).set({ addressLine: "5 King St W", postalCode: "M5H 1A1" }).where(eq(deliveries.id, e.id)),
    };
    for (const [what, change] of Object.entries(changes)) {
      await reset();
      const { order, wed, org } = await orderWithOrg();
      const h = await addHoliday(org, "2030-01-09");
      await apply(order);
      await change((await extrasOf(order.id, wed.id))[0]!);

      const res = await undo(order.id, h.id);

      expect([res.restored, res.left], what).toEqual([[], ["2030-01-09"]]);
      const src = await rowById(wed.id);
      // No longer a holiday, and settled by its added days: it can be neither resumed nor moved again.
      expect([src.status, src.holidayId], what).toEqual(["skipped", null]);
      expect((await extrasOf(order.id, wed.id)).length, what).toBe(2);
      await expect(rescheduleDelivery(wed.publicId, "2030-01-21", 1n, "2030-01-09"), what).rejects.toThrow("This delivery has already been rescheduled");
    }
  });

  it("keeps the added days once the closed day's own cutoff has passed", async () => {
    const { order, wed, org } = await orderWithOrg();
    const h = await addHoliday(org, "2030-01-09");
    await apply(order);
    await db.update(deliveries).set({ cutoffAt: Date.now() - 1000 }).where(eq(deliveries.id, wed.id));
    const res = await undo(order.id, h.id);
    expect([res.restored, res.left]).toEqual([[], ["2030-01-09"]]);
    expect((await extrasOf(order.id, wed.id)).length).toBe(2);
  });

  it("a held row tagged after the fact only loses its label on undo", async () => {
    const { order, mon, org } = await orderWithOrg();
    const h = await addHoliday(org, "2030-01-07");
    await db.update(deliveries).set({ status: "skipped", holidayId: h.id }).where(eq(deliveries.id, mon.id));
    const res = await undo(order.id, h.id);
    expect([res.restored, res.left]).toEqual([[], ["2030-01-07"]]);
    const row = await rowById(mon.id);
    expect([row.status, row.holidayId, row.tiffinUnits]).toEqual(["skipped", null, 2]);
  });

  it("a day still waiting for placing goes straight back on", async () => {
    const { order, wed, org } = await orderWithOrg();
    await db.update(orders).set({ trialLength: 3, trialWeekdays: ["mon", "wed", "fri"] }).where(eq(orders.id, order.id));
    const h = await addHoliday(org, "2030-01-09");
    await apply(order);
    const res = await undo(order.id, h.id);
    expect([res.restored, res.left]).toEqual([["2030-01-09"], []]);
    expect([(await rowById(wed.id)).status, (await rowById(wed.id)).holidayId]).toEqual(["scheduled", null]);
  });
});

describe("placeHolidayExtras", () => {
  beforeEach(reset);
  afterAll(reset);

  it("staff place a waiting day on the first free plan weekdays from a chosen date, once", async () => {
    const { order, wed, org } = await orderWithOrg();
    await db.update(orders).set({ trialLength: 3, trialWeekdays: ["mon", "wed", "fri"] }).where(eq(orders.id, order.id));
    await addHoliday(org, "2030-01-09");
    await apply(order);
    const place = (from: string) => locked(order.id, (tx, fresh) => placeHolidayExtras(tx, fresh, wed.id, from, 1n));

    await expect(place("2020-01-01")).rejects.toThrow("Pick today or a later date");
    expect(await place("2030-01-21")).toEqual(["2030-01-21", "2030-01-23"]);
    expect((await extrasOf(order.id, wed.id)).map((r) => [r.deliveryDate, r.status, r.tiffinUnits])).toEqual([["2030-01-21", "scheduled", 1], ["2030-01-23", "scheduled", 1]]);
    await expect(place("2030-01-28")).rejects.toThrow("Nothing to place");
  });
});

describe("a holiday is never a move target", () => {
  beforeEach(reset);
  afterAll(reset);

  it("refuses one tiffin moved out of a multi-day trip, a complimentary tiffin, and is skipped by re-delivery", async () => {
    const { order, mon, fri, org } = await orderWithOrg();
    await addHoliday(org, "2030-01-14", "closed");
    const refusal = `Kitchen is closed on Mon, Jan 14: ${PFX} closed`;
    await expect(rescheduleDelivery(mon.publicId, "2030-01-14", 1n, "2030-01-07")).rejects.toThrow(refusal);
    await expect(grantComplimentaryTiffin(order.publicId, { date: "2030-01-14", note: "Sorry", notify: false }, null)).rejects.toThrow(refusal);
    expect((await redeliverTrip(fri.publicId, 1n)).targetDate).toBe("2030-01-16");
  });

  it("refuses a whole single-tiffin trip moved onto a holiday", async () => {
    const { mon, org } = await orderWithOrg("5_day");
    await addHoliday(org, "2030-01-14", "closed");
    await expect(rescheduleDelivery(mon.publicId, "2030-01-14", 1n)).rejects.toThrow(`Kitchen is closed on Mon, Jan 14: ${PFX} closed`);
  });
});
