import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { asc, eq, inArray, isNull, like, sql } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
vi.mock("@/lib/services/optimoroute/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/optimoroute/client")>();
  return { ...actual, deleteOrder: vi.fn(async () => undefined) };
});
vi.mock("@/lib/services/optimoroute/push", () => ({ pushOneDelivery: vi.fn(async () => undefined) }));

const { db } = await import("@/db/client");
const { deliveries, holidays, ledgerEntries, orders, organization, payments, subscriptionPauses, users } = await import("@/db/schema");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");
const { changeOrderEatingDays, changeOrderStartDate, createOrder, startMigratedOrder } = await import("../orders.service");
const { applyHolidaysToOrder } = await import("../holiday-apply");
const { releasePausedDays } = await import("../pause-days.service");
const { getPauseUsage } = await import("../pause-limits.service");
const { adminSetDeliveryStatus } = await import("../deliveries.service");
const { makeTripOrder, resetTrips } = await import("./trip-fixture");
const { deleteOrder } = await import("@/lib/services/optimoroute/client");

const DEP = "SUB-HOLORDER01";
const WC_DEP = "wc-holord01";
const PFX = "tholord";
// createOrder always files under the brand organization, so that one test declares its holiday there,
// far out so no parallel file that creates a near-term order meets it.
const FAR_MON = "2030-03-04";
const FAR_TUE = "2030-03-05";
const createdOrderIds: bigint[] = [];
const createdUserIds: bigint[] = [];

async function brandOrgId(): Promise<string> {
  const [row] = await db.select({ id: organization.id }).from(organization).where(isNull(organization.parentOrganizationId)).limit(1);
  if (row) return row.id;
  const [made] = await db.insert(organization).values({ name: "Tiffin Grab", clientCode: "TG", parentOrganizationId: null }).returning({ id: organization.id });
  return made!.id;
}
// Own organization per file: holidays are unique per organization + date, and files run in parallel.
async function ownOrgId(): Promise<string> {
  const slug = `${PFX}-org`;
  const [row] = await db.select({ id: organization.id }).from(organization).where(eq(organization.slug, slug)).limit(1);
  if (row) return row.id;
  const [made] = await db.insert(organization).values({ name: `${PFX} org`, slug, clientCode: PFX.toUpperCase() }).onConflictDoNothing().returning({ id: organization.id });
  if (made) return made.id;
  return (await db.select({ id: organization.id }).from(organization).where(eq(organization.slug, slug)).limit(1))[0]!.id;
}
const reset = async () => {
  const orderIds = createdOrderIds.splice(0);
  const userIds = createdUserIds.splice(0);
  if (orderIds.length) {
    await db.delete(ledgerEntries).where(inArray(ledgerEntries.orderId, orderIds));
    await db.delete(payments).where(inArray(payments.orderId, orderIds));
    await db.delete(orders).where(inArray(orders.id, orderIds));
  }
  if (userIds.length) await db.delete(users).where(inArray(users.id, userIds));
  await resetTrips(WC_DEP, "tholord-none");
  await resetTrips(DEP, PFX);
  await db.delete(holidays).where(like(holidays.name, `${PFX}%`));
};
/** MWF order from Mon 2030-01-07: Mon [7,8], Wed [9,10], Fri [11,12,13]. */
async function orderWithOrg(dep = DEP) {
  const made = await makeTripOrder(dep, PFX);
  const org = await ownOrgId();
  const [order] = await db.update(orders).set({ organizationId: org }).where(eq(orders.id, made.order.id)).returning();
  return { ...made, order: order!, org };
}
const addHoliday = (org: string, date: string) => db.insert(holidays).values({ organizationId: org, date, name: `${PFX} ${date}` });
const rowsOf = (orderId: bigint) => db.select().from(deliveries).where(eq(deliveries.orderId, orderId)).orderBy(asc(deliveries.deliveryDate));
const scheduledDates = async (orderId: bigint) => (await rowsOf(orderId)).filter((r) => r.status === "scheduled").map((r) => r.deliveryDate);
const scheduledUnits = async (orderId: bigint) => (await rowsOf(orderId)).filter((r) => r.status === "scheduled").reduce((n, r) => n + r.tiffinUnits, 0);

describe("holidays at schedule writes", () => {
  beforeEach(reset);
  afterEach(reset);
  afterAll(reset);

  it("a new order across a declared holiday keeps its priced tiffin count", async () => {
    const org = await brandOrgId();
    const closed = FAR_TUE;
    await addHoliday(org, closed);
    const snap = await loadCatalogSnapshot();

    const { publicId } = await createOrder({
      planKey: snap.plans[0].key,
      selections: {
        mealSizeId: snap.mealSizes[0].publicId, frequencyKey: "5_day", persons: 1, mealSlots: ["lunch"],
        includeSaturday: false, includeSunday: false, durationWeeks: 1, startDate: FAR_MON,
      },
      contact: { email: `${PFX}${Math.random().toString(36).slice(2)}@test.invalid`, fullName: "A B", phone: `+1647555${Math.floor(1000 + Math.random() * 9000)}`, addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6" },
    });

    const [o] = await db.select().from(orders).where(eq(orders.publicId, publicId));
    createdOrderIds.push(o!.id);
    if (o!.userId != null) createdUserIds.push(o!.userId);
    expect(o!.status).toBe("active");
    const rows = await rowsOf(o!.id);
    const closedRow = rows.find((r) => r.deliveryDate === closed)!;
    expect([closedRow.status, closedRow.holidayId != null]).toEqual(["paused", true]);
    expect(rows.filter((r) => r.holidayExtraForDeliveryId === closedRow.id).length).toBe(closedRow.tiffinUnits);
    expect(await scheduledUnits(o!.id)).toBe(o!.tiffinCount);
  });

  it("a plan cannot start on a holiday", async () => {
    const { order, org } = await orderWithOrg();
    await addHoliday(org, "2030-01-14");
    await expect(changeOrderStartDate(order.publicId, "2030-01-14")).rejects.toThrow("We are closed on Mon, Jan 14");
  });

  it("a rebuilt schedule after a start-date change closes the holiday and keeps the tiffin total", async () => {
    const { order, org } = await orderWithOrg();
    await addHoliday(org, "2030-01-16");

    await changeOrderStartDate(order.publicId, "2030-01-14");

    expect(await scheduledDates(order.id)).toEqual(["2030-01-14", "2030-01-18", "2030-01-21", "2030-01-23"]);
    expect((await rowsOf(order.id)).filter((r) => r.status === "paused").map((r) => [r.deliveryDate, r.holidayId != null])).toEqual([["2030-01-16", true]]);
    expect(await scheduledUnits(order.id)).toBe(order.tiffinCount);
  });

  it("a plan that already spans a holiday can still change its start date", async () => {
    const { order, org } = await orderWithOrg();
    await addHoliday(org, "2030-01-09");
    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(${order.id})`);
      await applyHolidaysToOrder(tx, order, null);
    });
    expect((await rowsOf(order.id)).some((r) => r.holidayId != null)).toBe(true);
    await addHoliday(org, "2030-01-16");

    await expect(changeOrderStartDate(order.publicId, "2030-01-14")).resolves.toBeUndefined();

    const scheduled = await scheduledDates(order.id);
    expect(scheduled[0]).toBe("2030-01-14");
    expect(scheduled).not.toContain("2030-01-09");
    expect(scheduled).not.toContain("2030-01-16");
    expect(await scheduledUnits(order.id)).toBe(order.tiffinCount);
  });

  it("starting a migrated plan across a holiday keeps the day closed and the tiffin total", async () => {
    const { order, org } = await orderWithOrg(WC_DEP);
    await addHoliday(org, "2030-01-09");
    await db.delete(deliveries).where(eq(deliveries.orderId, order.id));
    await db.update(orders).set({ status: "pending" }).where(eq(orders.id, order.id));

    await startMigratedOrder(order.publicId, "2030-01-07");

    expect(await scheduledDates(order.id)).toEqual(["2030-01-07", "2030-01-11", "2030-01-14", "2030-01-16"]);
    expect(await scheduledUnits(order.id)).toBe(order.tiffinCount);
  });

  it("new eating days that land on a holiday close it and keep the tiffin total", async () => {
    const made = await makeTripOrder(DEP, PFX, 1, "5_day", 2, { days: ["mon", "tue", "wed", "thu", "fri"], tiffinCount: 10 });
    const org = await ownOrgId();
    const [order] = await db.update(orders).set({ organizationId: org }).where(eq(orders.id, made.order.id)).returning();
    // Mon/Wed/Fri lays the ten tiffins out to Mon 2030-01-28; the third Wednesday is a holiday.
    await addHoliday(org, "2030-01-23");

    await changeOrderEatingDays(order!.publicId, ["mon", "wed", "fri"]);

    const scheduled = await scheduledDates(order!.id);
    expect(scheduled).not.toContain("2030-01-23");
    expect((await rowsOf(order!.id)).filter((r) => r.holidayId != null).map((r) => r.deliveryDate)).toEqual(["2030-01-23"]);
    expect(await scheduledUnits(order!.id)).toBe(order!.tiffinCount);
  });

  it("a migrated plan cannot start on a holiday", async () => {
    const { order, org } = await orderWithOrg(WC_DEP);
    await addHoliday(org, "2030-01-07");
    await db.delete(deliveries).where(eq(deliveries.orderId, order.id));
    await db.update(orders).set({ status: "pending" }).where(eq(orders.id, order.id));
    await expect(startMigratedOrder(order.publicId, "2030-01-07")).rejects.toThrow("We are closed on Mon, Jan 7");
  });
});

describe("a customer pause that meets a holiday", () => {
  beforeEach(reset);
  afterEach(reset);
  afterAll(reset);

  /** The customer paused Wed 2030-01-09 before the holiday was declared: the row is theirs, the log charges one day. */
  async function pausedThenDeclared() {
    const made = await orderWithOrg();
    await db.update(deliveries).set({ status: "paused" }).where(eq(deliveries.id, made.wed.id));
    await db.insert(subscriptionPauses).values({
      orderId: made.order.id, fromDate: "2030-01-09", untilDate: "2030-01-09", isIndefinite: false,
      deliveryDates: ["2030-01-09"], releasedDates: [], resumedAt: new Date(),
    });
    await addHoliday(made.org, "2030-01-09");
    return made;
  }

  it("resuming a customer-paused day that became a holiday turns it into the holiday day and refunds the pause", async () => {
    const { order, wed } = await pausedThenDeclared();
    expect((await getPauseUsage(order.id)).daysUsed).toBe(1);

    // Nothing is back on the schedule, so no date is reported as resumed.
    expect(await releasePausedDays(order.publicId, ["2030-01-09"], null)).toEqual([]);

    const rows = await rowsOf(order.id);
    const closed = rows.find((r) => r.id === wed.id)!;
    expect([closed.status, closed.holidayId != null]).toEqual(["paused", true]);
    expect(rows.filter((r) => r.holidayExtraForDeliveryId === wed.id).map((r) => r.deliveryDate)).toEqual(["2030-01-14", "2030-01-16"]);
    expect((await getPauseUsage(order.id)).daysUsed).toBe(0);
    expect(await scheduledUnits(order.id)).toBe(order.tiffinCount);
  });

  it("a resumed day closed again by the holiday has its route stop removed after commit", async () => {
    const { order, wed } = await pausedThenDeclared();
    await db.update(deliveries).set({ routeSyncedAt: Date.now() }).where(eq(deliveries.id, wed.id));
    vi.mocked(deleteOrder).mockClear();

    await releasePausedDays(order.publicId, ["2030-01-09"], null);

    expect(deleteOrder).toHaveBeenCalledWith(wed.publicId);
    expect((await db.select().from(deliveries).where(eq(deliveries.id, wed.id)))[0]!.routeSyncedAt).toBeNull();
  });

  it("the admin status select cannot put a paused day back onto a holiday", async () => {
    const { wed } = await pausedThenDeclared();
    await expect(adminSetDeliveryStatus(wed.publicId, "upcoming", null)).rejects.toThrow("Kitchen is closed on Wed, Jan 9");
    expect((await db.select().from(deliveries).where(eq(deliveries.id, wed.id)))[0]!.status).toBe("paused");
  });
});
