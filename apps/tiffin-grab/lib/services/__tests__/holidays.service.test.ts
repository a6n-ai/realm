import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { asc, eq, inArray, isNull, like } from "drizzle-orm";
import { cutoffMsFor, zonedDateIso } from "@foundry/commons";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
vi.mock("@/lib/services/optimoroute/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/optimoroute/client")>();
  return { ...actual, deleteOrder: vi.fn(async () => undefined) };
});
vi.mock("@/lib/services/optimoroute/push", () => ({ pushOneDelivery: vi.fn(async () => undefined) }));

// Lets a test make one customer's notice fail (after the real enqueue, so the rollback is what hides it) or run a step mid-removal.
const hook = vi.hoisted(() => ({ failUsers: new Set<bigint>(), after: null as null | ((event: string, recipientId: bigint) => Promise<void>) }));
vi.mock("@/lib/notifications/enqueue", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/notifications/enqueue")>();
  return {
    ...actual,
    enqueueNotification: async (...args: Parameters<typeof actual.enqueueNotification>) => {
      await actual.enqueueNotification(...args);
      const { event, recipientId } = args[1];
      if (recipientId != null && hook.failUsers.has(recipientId)) throw new Error("forced failure");
      if (recipientId != null) await hook.after?.(event, recipientId);
    },
  };
});

const { db } = await import("@/db/client");
const { deliveries, holidays, orders, organization, users } = await import("@/db/schema");
const { notificationTables } = await import("@/lib/notifications/tables");
const { getAppSettings } = await import("../app-settings.service");
const {
  checkoutHolidayDates, createHoliday, holidayNamesForUser, holidaysOn, listDeclarableOrganizations, listHolidays, listNeedsPlacing, placeHolidayDay,
  previewHoliday, reapplyHoliday, removeHoliday, renameHoliday,
} = await import("../holidays.service");
const { deleteOrder } = await import("@/lib/services/optimoroute/client");
const { makeTripOrder, resetTrips } = await import("./trip-fixture");

const DEP = "SUB-HOLSVC0001";
const DEP2 = "SUB-HOLSVC0002";
const PFX = "tholsvc";
const outbox = notificationTables.notificationOutbox;

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
  hook.failUsers.clear();
  hook.after = null;
  // Only this file's customers' messages: the outbox is shared with the other holiday files.
  const mine = await db.select({ id: users.id }).from(users).where(like(users.email, `${PFX}%@test.invalid`));
  if (mine.length) await db.delete(outbox).where(inArray(outbox.recipientId, mine.map((u) => u.id)));
  // Both orders share PFX users: clear DEP2's order without touching users, so the user delete below is not blocked.
  await resetTrips(DEP2, "nomatch-");
  await resetTrips(DEP, PFX);
  await db.delete(holidays).where(like(holidays.name, `${PFX}%`));
};
const brandOrgId = ownOrgId;
/** MWF order from Mon 2030-01-07: Mon [7,8], Wed [9,10], Fri [11,12,13]. */
async function orderWithOrg(dep = DEP) {
  const made = await makeTripOrder(dep, PFX);
  const org = await brandOrgId();
  const [order] = await db.update(orders).set({ organizationId: org }).where(eq(orders.id, made.order.id)).returning();
  return { ...made, order: order!, org };
}
const rowsOf = (orderId: bigint) => db.select().from(deliveries).where(eq(deliveries.orderId, orderId)).orderBy(asc(deliveries.deliveryDate));
const rowById = async (id: bigint) => (await db.select().from(deliveries).where(eq(deliveries.id, id)))[0]!;
const declare = async (org: string, over: Partial<{ date: string; name: string; notify: boolean; confirmToday: boolean }> = {}) => {
  const res = await createHoliday({ organizationId: org, date: "2030-01-09", name: `${PFX} Diwali`, notify: false, ...over }, 1n, "all");
  if (!res.created) throw new Error("expected a created holiday");
  return res;
};
const todayIso = async () => zonedDateIso(Date.now(), (await getAppSettings()).timezone);

describe("holidays.service", () => {
  beforeEach(reset);
  afterAll(reset);

  it("declares the holiday, closes trips, drops routed stops and notifies once per order", async () => {
    const { order, wed, org } = await orderWithOrg();
    await db.update(deliveries).set({ routeSyncedAt: Date.now() }).where(eq(deliveries.id, wed.id));

    const res = await declare(org, { name: `  ${PFX} Diwali  `, notify: true });

    expect(res).toMatchObject({ created: true, closed: 1, needsPlacing: 0, failed: [], removedFromRoute: 1 });
    expect(deleteOrder).toHaveBeenCalledWith(wed.publicId);
    expect((await rowById(wed.id)).routeSyncedAt).toBeNull();
    const [h] = await db.select().from(holidays).where(eq(holidays.publicId, res.publicId));
    expect([h!.name, h!.createdBy, h!.notifiedAt != null]).toEqual([`${PFX} Diwali`, 1n, true]);
    const sent = await db.select().from(outbox).where(like(outbox.dedupeKey, `holiday:${h!.publicId}:${order.publicId}%`));
    expect(sent.length).toBeGreaterThan(0);
    expect((sent[0]!.payload as { body: string }).body).toContain("Mon, Jan 14, Wed, Jan 16");
    expect((sent[0]!.payload as { body: string }).body).toContain("added back at the end of your plan");
    expect((await listHolidays("all")).find((r) => r.publicId === h!.publicId)?.closed).toBe(1);
    expect((await holidaysOn("2030-01-09", [org])).map((x) => x.name)).toEqual([`${PFX} Diwali`]);
    expect(await holidaysOn("2030-01-09", [])).toEqual([]);
  });

  it("sends nothing when notify is off", async () => {
    const { order, org } = await orderWithOrg();
    const res = await declare(org, { notify: false });
    expect(await db.select().from(outbox).where(like(outbox.dedupeKey, `holiday:${res.publicId}:${order.publicId}%`))).toEqual([]);
    expect((await db.select().from(holidays).where(eq(holidays.publicId, res.publicId)))[0]!.notifiedAt).toBeNull();
  });

  it("rejects a past date, an impossible date, a blank or long name, markup and a duplicate", async () => {
    const { org } = await orderWithOrg();
    const make = (date: string, name: string) => createHoliday({ organizationId: org, date, name, notify: false }, 1n, "all");
    await expect(make("2020-01-01", `${PFX} x`)).rejects.toThrow("A holiday cannot be in the past");
    await expect(make("2030-02-31", `${PFX} x`)).rejects.toThrow("Pick a date");
    await expect(make("2030-01-09", "   ")).rejects.toThrow("Give the holiday a name");
    await expect(make("2030-01-09", "x".repeat(61))).rejects.toThrow("Keep the name under 60 characters");
    await expect(make("2030-01-09", `${PFX} <b>Diwali</b>`)).rejects.toThrow("Holiday names cannot contain < or >");
    expect(await db.select().from(holidays).where(like(holidays.name, `${PFX}%`))).toEqual([]);

    const nice = `${PFX} Diwali & New Year's (2030)`;
    const res = await declare(org, { name: nice });
    await expect(make("2030-01-09", `${PFX} two`)).rejects.toThrow("is already a holiday");
    await expect(renameHoliday(res.publicId, "Diwali <script>", 2n, "all")).rejects.toThrow("Holiday names cannot contain < or >");
    expect((await db.select().from(holidays).where(eq(holidays.publicId, res.publicId)))[0]!.name).toBe(nice);
  });

  it("for today, returns a preview and writes nothing until confirmed", async () => {
    const { order, mon, org } = await orderWithOrg();
    const today = await todayIso();
    await db.update(deliveries).set({ deliveryDate: today }).where(eq(deliveries.id, mon.id));
    const before = await rowsOf(order.id);
    const res = await createHoliday({ organizationId: org, date: today, name: `${PFX} storm`, notify: true }, 1n, "all");
    expect(res).toEqual({ created: false, preview: { affected: 1, onRoute: 0, delivered: 0 } });
    expect(await db.select().from(holidays).where(like(holidays.name, `${PFX}%`))).toEqual([]);
    expect(await rowsOf(order.id)).toEqual(before);
    expect(await db.select().from(outbox).where(eq(outbox.recipientId, order.userId!))).toEqual([]);
    expect((await declare(org, { date: today, name: `${PFX} storm`, confirmToday: true })).created).toBe(true);
  });

  it("previews affected, routed and delivered counts", async () => {
    const { wed, org } = await orderWithOrg();
    await db.update(deliveries).set({ routeSyncedAt: Date.now() }).where(eq(deliveries.id, wed.id));
    expect(await previewHoliday({ organizationId: org, date: "2030-01-09" }, "all")).toEqual({ affected: 1, onRoute: 1, delivered: 0 });
    await db.update(deliveries).set({ optimoCompletionStatus: "success" }).where(eq(deliveries.id, wed.id));
    expect(await previewHoliday({ organizationId: org, date: "2030-01-09" }, "all")).toEqual({ affected: 0, onRoute: 0, delivered: 1 });
  });

  it("two concurrent declares create one holiday and close each trip once", async () => {
    const { order, wed, org } = await orderWithOrg();
    const input = { organizationId: org, date: "2030-01-09", name: `${PFX} race`, notify: false };

    const results = await Promise.allSettled([createHoliday(input, 1n, "all"), createHoliday(input, 2n, "all")]);

    expect(results.filter((r) => r.status === "fulfilled").length).toBe(1);
    expect(String((results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason.message)).toContain("is already a holiday");
    expect((await db.select().from(holidays).where(like(holidays.name, `${PFX}%`))).length).toBe(1);
    expect((await rowsOf(order.id)).filter((r) => r.holidayExtraForDeliveryId === wed.id).length).toBe(2);
  });

  it("re-apply closes an order the first run missed and leaves the rest as they are", async () => {
    const a = await orderWithOrg();
    const res = await declare(a.org);
    const before = (await rowsOf(a.order.id)).map((r) => [r.deliveryDate, r.status]);
    // An order whose delivery on the closed day appeared after the declare ran (a run that died part-way looks the same).
    const b = await orderWithOrg(DEP2);

    expect(await reapplyHoliday(res.publicId, 2n, "all")).toEqual({ closed: 1, needsPlacing: 0, failed: [], removedFromRoute: 0 });

    expect((await rowById(b.wed.id)).status).toBe("paused");
    expect((await rowsOf(a.order.id)).map((r) => [r.deliveryDate, r.status])).toEqual(before);
    expect(await reapplyHoliday(res.publicId, 2n, "all")).toEqual({ closed: 0, needsPlacing: 0, failed: [], removedFromRoute: 0 });
  });

  it("renames, and removes with the day restored", async () => {
    const { order, wed, org } = await orderWithOrg();
    const res = await declare(org, { name: `${PFX} old` });
    await renameHoliday(res.publicId, `${PFX} new`, 2n, "all");
    const [h] = await db.select().from(holidays).where(eq(holidays.publicId, res.publicId));
    expect([h!.name, h!.updatedBy]).toEqual([`${PFX} new`, 2n]);

    expect(await removeHoliday(res.publicId, 1n, "all")).toEqual({ restored: 1, left: 0, failed: [], removed: true, stillOwed: 0 });

    expect(await db.select().from(holidays).where(eq(holidays.publicId, res.publicId))).toEqual([]);
    expect((await rowsOf(order.id)).map((r) => [r.deliveryDate, r.status])).toEqual([["2030-01-07", "scheduled"], ["2030-01-09", "scheduled"], ["2030-01-11", "scheduled"]]);
    expect((await rowById(wed.id)).holidayId).toBeNull();
  });

  it("remove after the customer changed the extra day keeps it and tells the customer", async () => {
    const { order, wed, org } = await orderWithOrg();
    const res = await declare(org, { notify: true });
    const [extra] = (await rowsOf(order.id)).filter((r) => r.holidayExtraForDeliveryId === wed.id);
    await db.update(deliveries).set({ status: "paused" }).where(eq(deliveries.id, extra!.id));

    expect(await removeHoliday(res.publicId, 1n, "all")).toEqual({ restored: 0, left: 1, failed: [], removed: true, stillOwed: 0 });

    expect([(await rowById(wed.id)).status, (await rowById(wed.id)).holidayId]).toEqual(["skipped", null]);
    expect((await rowsOf(order.id)).filter((r) => r.holidayExtraForDeliveryId === wed.id).length).toBe(2);
    const sent = await db.select().from(outbox).where(like(outbox.dedupeKey, `holiday_removed:${res.publicId}:${order.publicId}%`));
    expect(sent.length).toBeGreaterThan(0);
    expect((sent[0]!.payload as { body: string }).body).toContain("is not going out. Your extra day on Mon, Jan 14, Wed, Jan 16 stays");
  });

  it("remove tells nobody when the declare told nobody", async () => {
    const { order, org } = await orderWithOrg();
    const res = await declare(org, { notify: false });
    await removeHoliday(res.publicId, 1n, "all");
    expect(await db.select().from(outbox).where(like(outbox.dedupeKey, `holiday_removed:${res.publicId}:${order.publicId}%`))).toEqual([]);
  });

  it("refuses to remove a holiday that is today", async () => {
    const { org } = await orderWithOrg();
    const res = await declare(org, { date: await todayIso(), name: `${PFX} today`, confirmToday: true });
    await expect(removeHoliday(res.publicId, 1n, "all")).rejects.toThrow("Only a future holiday can be removed");
  });

  it("a past-dated holiday row exists for display: listed, shown on its day, renamed, never removed or re-applied", async () => {
    const org = await brandOrgId();
    const [past] = await db.insert(holidays).values({ organizationId: org, date: "2020-10-12", name: `${PFX} Thanksgiving` }).returning();

    expect((await listHolidays("all")).some((r) => r.publicId === past!.publicId)).toBe(true);
    expect((await holidaysOn("2020-10-12", "all")).map((x) => x.name)).toContain(`${PFX} Thanksgiving`);
    await renameHoliday(past!.publicId, `${PFX} Thanksgiving Day`, 2n, "all");
    await expect(removeHoliday(past!.publicId, 1n, "all")).rejects.toThrow("Only a future holiday can be removed");
    await expect(reapplyHoliday(past!.publicId, 1n, "all")).rejects.toThrow("A past holiday cannot be re-applied");
    await expect(createHoliday({ organizationId: org, date: "2020-10-13", name: `${PFX} late`, notify: false }, 1n, "all")).rejects.toThrow("A holiday cannot be in the past");
  });

  it("never touches holidays or organizations outside the caller's visible set", async () => {
    const { wed, org } = await orderWithOrg();
    await db.update(orders).set({ trialLength: 3, trialWeekdays: ["mon", "wed", "fri"] }).where(eq(orders.id, wed.orderId));
    const other = ["some_other_org"];
    for (const visible of [[], other]) {
      await expect(createHoliday({ organizationId: org, date: "2030-01-09", name: `${PFX} no`, notify: false }, 1n, visible)).rejects.toThrow("Organization not found");
      await expect(previewHoliday({ organizationId: org, date: "2030-01-09" }, visible)).rejects.toThrow("Organization not found");
    }
    expect(await db.select().from(holidays).where(like(holidays.name, `${PFX}%`))).toEqual([]);

    const res = await createHoliday({ organizationId: org, date: "2030-01-09", name: `${PFX} mine`, notify: false }, 1n, [org]);
    if (!res.created) throw new Error("expected a created holiday");
    for (const visible of [[], other]) {
      await expect(renameHoliday(res.publicId, `${PFX} hijack`, 2n, visible)).rejects.toThrow("Holiday not found");
      await expect(removeHoliday(res.publicId, 2n, visible)).rejects.toThrow("Holiday not found");
      await expect(reapplyHoliday(res.publicId, 2n, visible)).rejects.toThrow("Holiday not found");
      await expect(placeHolidayDay(wed.publicId, "2030-01-21", 2n, visible)).rejects.toThrow("Delivery not found");
      expect(await listNeedsPlacing(visible)).toEqual([]);
      expect(await listHolidays(visible)).toEqual([]);
    }
    const [h] = await db.select().from(holidays).where(eq(holidays.publicId, res.publicId));
    expect([h!.name, h!.updatedBy]).toEqual([`${PFX} mine`, 1n]);
    expect(await removeHoliday(res.publicId, 2n, [org])).toEqual({ restored: 1, left: 0, failed: [], removed: true, stillOwed: 0 });
  });

  it("does not close an order that has no organization", async () => {
    const { order, wed, org } = await orderWithOrg();
    await db.update(orders).set({ organizationId: null }).where(eq(orders.id, order.id));
    expect(await declare(org, { name: `${PFX} orphan` })).toMatchObject({ created: true, closed: 0 });
    expect([(await rowById(wed.id)).status, (await rowById(wed.id)).holidayId]).toEqual(["scheduled", null]);
  });

  it("lists a day waiting for placing and places it from a chosen date", async () => {
    const { order, wed, org } = await orderWithOrg();
    await db.update(orders).set({ trialLength: 3, trialWeekdays: ["mon", "wed", "fri"] }).where(eq(orders.id, order.id));
    const res = await declare(org);
    expect(res).toMatchObject({ closed: 1, needsPlacing: 1 });

    const waiting = (await listNeedsPlacing("all")).filter((r) => r.holidayPublicId === res.publicId);
    expect(waiting).toEqual([{
      deliveryPublicId: wed.publicId, date: "2030-01-09", holidayPublicId: res.publicId, holidayName: `${PFX} Diwali`,
      orderPublicId: order.publicId, orderCode: DEP, customerName: "Trip Tester", tiffins: 2, trial: true, held: false,
    }]);

    expect(await placeHolidayDay(wed.publicId, "2030-01-21", 3n, [org])).toEqual(["2030-01-21", "2030-01-23"]);
    expect((await listNeedsPlacing("all")).filter((r) => r.holidayPublicId === res.publicId)).toEqual([]);
  });

  it("lists a held row tagged after the fact as waiting, marked held", async () => {
    const { order, mon, org } = await orderWithOrg();
    const [retro] = await db.insert(holidays).values({ organizationId: org, date: "2030-01-07", name: `${PFX} retro` }).returning();
    await db.update(deliveries).set({ status: "skipped", holidayId: retro!.id }).where(eq(deliveries.id, mon.id));
    const waiting = (await listNeedsPlacing("all")).filter((r) => r.holidayPublicId === retro!.publicId);
    expect(waiting.map((r) => [r.orderPublicId, r.held, r.tiffins])).toEqual([[order.publicId, true, 2]]);
  });

  it("lists the organizations a caller may declare for, brand first", async () => {
    const all = await listDeclarableOrganizations("all");
    const brands = await db.select({ id: organization.id }).from(organization).where(isNull(organization.parentOrganizationId));
    const brandIds = new Set(brands.map((b) => b.id));
    expect(brandIds.has(all[0]!.id)).toBe(true);
    const firstChild = all.findIndex((o) => !brandIds.has(o.id));
    expect(firstChild === -1 || all.slice(firstChild).every((o) => !brandIds.has(o.id))).toBe(true);
    expect(await listDeclarableOrganizations([all[0]!.id])).toEqual([all[0]]);
    expect(await listDeclarableOrganizations([])).toEqual([]);
    expect(await listDeclarableOrganizations(["no_such_org"])).toEqual([]);
  });
  it("lists the holiday names a customer sees and the dates a checkout cannot start on", async () => {
    const { order, org } = await orderWithOrg();
    const res = await declare(org, { name: `${PFX} Diwali` });
    expect(await holidayNamesForUser(order.userId!, "2030-01-01")).toEqual({ "2030-01-09": `${PFX} Diwali` });
    expect(await holidayNamesForUser(order.userId!, "2030-01-10")).toEqual({});
    expect(res.created).toBe(true);
    expect(await checkoutHolidayDates("2030-01-01")).toContain("2030-01-09");
  });
  it("an organization that does not exist is the same not-found as one the caller cannot see", async () => {
    await expect(createHoliday({ organizationId: "no_such_org", date: "2030-01-09", name: `${PFX} x`, notify: false }, 1n, "all")).rejects.toThrow("Organization not found");
    await expect(previewHoliday({ organizationId: "no_such_org", date: "2030-01-09" }, "all")).rejects.toThrow("Organization not found");
  });

  it("one order failing rolls back only itself; re-apply closes it, tells it once and tells nobody twice", async () => {
    const a = await orderWithOrg();
    const b = await orderWithOrg(DEP2);
    const sentTo = async (o: { order: { publicId: string } }, id: string) => (await db.select().from(outbox).where(like(outbox.dedupeKey, `holiday:${id}:${o.order.publicId}%`))).length;
    hook.failUsers.add(b.order.userId!);
    // What a run that dies after its first customer would leave behind: the flag must already be there.
    let stampedMidRun: number | null = null;
    hook.after = async () => {
      stampedMidRun = (await db.select().from(holidays).where(like(holidays.name, `${PFX}%`)))[0]!.notifiedAt;
    };

    const res = await declare(a.org, { notify: true });

    expect(stampedMidRun).not.toBeNull();
    expect(res).toMatchObject({ closed: 1, failed: [DEP2] });
    expect((await rowById(a.wed.id)).status).toBe("paused");
    expect([(await rowById(b.wed.id)).status, (await rowById(b.wed.id)).holidayId]).toEqual(["scheduled", null]);
    expect((await rowsOf(b.order.id)).filter((r) => r.holidayExtraForDeliveryId != null)).toEqual([]);
    const tellA = await sentTo(a, res.publicId);
    expect(tellA).toBeGreaterThan(0);
    expect(await sentTo(b, res.publicId)).toBe(0);
    expect((await db.select().from(holidays).where(eq(holidays.publicId, res.publicId)))[0]!.notifiedAt).not.toBeNull();

    hook.failUsers.clear();
    expect(await reapplyHoliday(res.publicId, 2n, "all")).toEqual({ closed: 1, needsPlacing: 0, failed: [], removedFromRoute: 0 });
    expect(await sentTo(b, res.publicId)).toBeGreaterThan(0);
    expect(await sentTo(a, res.publicId)).toBe(tellA);
    expect(await reapplyHoliday(res.publicId, 2n, "all")).toMatchObject({ closed: 0 });
    expect(await sentTo(a, res.publicId)).toBe(tellA);
  });

  it("a holiday declared without notices never sends one on re-apply", async () => {
    const a = await orderWithOrg();
    const res = await declare(a.org, { notify: false });
    const b = await orderWithOrg(DEP2);
    expect(await reapplyHoliday(res.publicId, 2n, "all")).toMatchObject({ closed: 1 });
    expect(await db.select().from(outbox).where(like(outbox.dedupeKey, `holiday:${res.publicId}:%`))).toEqual([]);
    expect((await rowById(b.wed.id)).status).toBe("paused");
  });

  it("removal: one order failing keeps itself as it was and the holiday until it is done", async () => {
    const a = await orderWithOrg();
    const b = await orderWithOrg(DEP2);
    const res = await declare(a.org, { notify: true });
    hook.failUsers.add(b.order.userId!);

    expect(await removeHoliday(res.publicId, 1n, "all")).toEqual({ restored: 1, left: 0, failed: [DEP2], removed: false, stillOwed: 0 });

    expect((await rowById(a.wed.id)).status).toBe("scheduled");
    expect([(await rowById(b.wed.id)).status, (await rowById(b.wed.id)).holidayId != null]).toEqual(["paused", true]);
    expect((await rowsOf(b.order.id)).filter((r) => r.holidayExtraForDeliveryId === b.wed.id).length).toBe(2);
    expect((await db.select().from(holidays).where(eq(holidays.publicId, res.publicId))).length).toBe(1);

    hook.failUsers.clear();
    expect(await removeHoliday(res.publicId, 1n, "all")).toEqual({ restored: 1, left: 0, failed: [], removed: true, stillOwed: 0 });
    expect(await db.select().from(holidays).where(eq(holidays.publicId, res.publicId))).toEqual([]);
  });

  it("removal: a delivery closed for the holiday mid-removal blocks the delete, names no order, and a second removal finishes", async () => {
    const a = await orderWithOrg();
    const res = await declare(a.org, { notify: true });
    const c = await orderWithOrg(DEP2);
    const [h] = await db.select().from(holidays).where(eq(holidays.publicId, res.publicId));
    hook.after = async (event) => {
      hook.after = null;
      if (event === "holiday_removed") await db.update(deliveries).set({ status: "paused", holidayId: h!.id }).where(eq(deliveries.id, c.wed.id));
    };

    expect(await removeHoliday(res.publicId, 1n, "all")).toEqual({ restored: 1, left: 0, failed: [], removed: false, stillOwed: 0 });
    expect((await db.select().from(holidays).where(eq(holidays.publicId, res.publicId))).length).toBe(1);

    expect(await removeHoliday(res.publicId, 1n, "all")).toEqual({ restored: 1, left: 0, failed: [], removed: true, stillOwed: 0 });
    expect((await rowById(c.wed.id)).status).toBe("scheduled");
  });

  it("the declare notice for a day that needs placing promises no added day and no new plan end", async () => {
    const { order, org } = await orderWithOrg();
    await db.update(orders).set({ trialLength: 3, trialWeekdays: ["mon", "wed", "fri"] }).where(eq(orders.id, order.id));
    const res = await declare(org, { notify: true });
    const [sent] = await db.select().from(outbox).where(like(outbox.dedupeKey, `holiday:${res.publicId}:${order.publicId}%`));
    const body = (sent!.payload as { body: string }).body;
    expect(body).toContain("Our team will place that tiffin on a new day");
    expect(body).not.toMatch(/added back|plan now ends/i);
    const vars = (sent!.payload as { vars: { order: { outcome: string } } }).vars.order;
    expect(vars.outcome).toBe(body);
  });

  it("the removal notice says what happened to the day: back on, extra day stays, or staff will place it", async () => {
    const body = async (orderPublicId: string, id: string) =>
      ((await db.select().from(outbox).where(like(outbox.dedupeKey, `holiday_removed:${id}:${orderPublicId}%`)))[0]!.payload as { body: string }).body;

    const a = await orderWithOrg();
    const ra = await declare(a.org, { notify: true });
    await removeHoliday(ra.publicId, 1n, "all");
    expect(await body(a.order.publicId, ra.publicId)).toBe("The kitchen is open on Wed, Jan 9 after all, so your delivery goes out that day and nothing is added at the end of your plan.");

    const c = await orderWithOrg(DEP2);
    await db.update(orders).set({ trialLength: 3, trialWeekdays: ["mon", "wed", "fri"] }).where(eq(orders.id, c.order.id));
    const rc = await declare(c.org, { notify: true });
    await db.update(deliveries).set({ cutoffAt: Date.now() - 1000 }).where(eq(deliveries.id, c.wed.id));
    expect(await removeHoliday(rc.publicId, 1n, "all")).toMatchObject({ stillOwed: 1, removed: false });
    expect(await body(c.order.publicId, rc.publicId)).toBe("Our closure on Wed, Jan 9 has been lifted, but your delivery for that date is not going out. Our team will place that tiffin on a new day.");
  });

  it("places a held row tagged after the fact, on a normal and a trial order, once", async () => {
    for (const trial of [false, true]) {
      await reset();
      const { order, mon, org } = await orderWithOrg();
      if (trial) await db.update(orders).set({ trialLength: 3, trialWeekdays: ["mon", "wed", "fri"] }).where(eq(orders.id, order.id));
      const [retro] = await db.insert(holidays).values({ organizationId: org, date: "2030-01-07", name: `${PFX} retro` }).returning();
      await db.update(deliveries).set({ status: "skipped", holidayId: retro!.id }).where(eq(deliveries.id, mon.id));
      const units = async () => (await rowsOf(order.id)).filter((r) => r.status === "scheduled").reduce((n, r) => n + r.tiffinUnits, 0);
      const before = await units();

      expect(await placeHolidayDay(mon.publicId, "2030-01-21", 3n, "all"), `trial=${trial}`).toEqual(["2030-01-21", "2030-01-23"]);

      expect(await units()).toBe(before + 2);
      expect((await listNeedsPlacing("all")).filter((r) => r.holidayPublicId === retro!.publicId)).toEqual([]);
      await expect(placeHolidayDay(mon.publicId, "2030-01-28", 3n, "all")).rejects.toThrow("Nothing to place");
      expect(await units()).toBe(before + 2);
      expect((await rowById(mon.id)).status).toBe("skipped");

      expect(await removeHoliday(retro!.publicId, 1n, "all")).toEqual({ restored: 0, left: 1, failed: [], removed: true, stillOwed: 0 });
      expect((await rowsOf(order.id)).filter((r) => r.holidayExtraForDeliveryId === mon.id).length).toBe(2);
    }
  });

  it("refuses a held tagged row whose tiffin the normal Move already moved", async () => {
    const { order, mon, org } = await orderWithOrg();
    const [retro] = await db.insert(holidays).values({ organizationId: org, date: "2030-01-07", name: `${PFX} retro` }).returning();
    await db.update(deliveries).set({ status: "skipped", holidayId: retro!.id }).where(eq(deliveries.id, mon.id));
    await db.insert(deliveries).values({ orderId: order.id, deliveryDate: "2030-01-14", status: "scheduled", cutoffAt: Date.now() + 1e9, tiffinUnits: 2, coversDates: ["2030-01-07", "2030-01-08"], makeupForDeliveryId: mon.id });
    await expect(placeHolidayDay(mon.publicId, "2030-01-21", 3n, "all")).rejects.toThrow("Nothing to place");
    expect((await listNeedsPlacing("all")).filter((r) => r.holidayPublicId === retro!.publicId)).toEqual([]);
  });
  it("removal is refused once the cutoff for the holiday date has passed, and writes nothing", async () => {
    const { wed, org } = await orderWithOrg();
    const res = await declare(org, { notify: true });
    const { cutoffHour, timezone } = await getAppSettings();
    vi.useFakeTimers({ toFake: ["Date"], now: cutoffMsFor("2030-01-09", cutoffHour, timezone) + 60_000 });
    try {
      await expect(removeHoliday(res.publicId, 1n, "all")).rejects.toThrow("This holiday can no longer be removed: the cutoff for Wed, Jan 9 has passed.");
    } finally {
      vi.useRealTimers();
    }
    expect([(await rowById(wed.id)).status, (await rowById(wed.id)).holidayId != null]).toEqual(["paused", true]);
    expect((await db.select().from(holidays).where(eq(holidays.publicId, res.publicId))).length).toBe(1);
    expect(await db.select().from(outbox).where(like(outbox.dedupeKey, `holiday_removed:${res.publicId}:%`))).toEqual([]);
  });

  it("a day undo cannot restore and that has no extra day stays tagged, listed and placeable; the holiday stays", async () => {
    const { order, wed, org } = await orderWithOrg();
    await db.update(orders).set({ trialLength: 3, trialWeekdays: ["mon", "wed", "fri"] }).where(eq(orders.id, order.id));
    const res = await declare(org, { notify: true });
    // The row's snapshotted cutoff no longer matches the app's: the one way removal can meet an unrestorable row.
    await db.update(deliveries).set({ cutoffAt: Date.now() - 1000 }).where(eq(deliveries.id, wed.id));

    expect(await removeHoliday(res.publicId, 1n, "all")).toEqual({ restored: 0, left: 0, failed: [], removed: false, stillOwed: 1 });

    expect([(await rowById(wed.id)).status, (await rowById(wed.id)).holidayId != null]).toEqual(["paused", true]);
    expect((await db.select().from(holidays).where(eq(holidays.publicId, res.publicId))).length).toBe(1);
    expect((await listNeedsPlacing("all")).filter((r) => r.holidayPublicId === res.publicId).map((r) => r.deliveryPublicId)).toEqual([wed.publicId]);
    const [sent] = await db.select().from(outbox).where(like(outbox.dedupeKey, `holiday_removed:${res.publicId}:${order.publicId}%`));
    expect((sent!.payload as { body: string }).body).toContain("Our team will place that tiffin on a new day");

    expect(await placeHolidayDay(wed.publicId, "2030-01-21", 3n, "all")).toEqual(["2030-01-21", "2030-01-23"]);
    expect(await removeHoliday(res.publicId, 1n, "all")).toEqual({ restored: 0, left: 1, failed: [], removed: true, stillOwed: 0 });
    expect([(await rowById(wed.id)).status, (await rowById(wed.id)).holidayId]).toEqual(["skipped", null]);
  });

  it("an emptied carrier (0 tiffins) is put back quietly: not restored, nothing said to the customer", async () => {
    const { order, wed, org } = await orderWithOrg();
    await db.update(deliveries).set({ tiffinUnits: 0 }).where(eq(deliveries.id, wed.id));
    const res = await declare(org, { notify: true });
    expect(res).toMatchObject({ closed: 1, needsPlacing: 0 });
    expect(await db.select().from(outbox).where(like(outbox.dedupeKey, `holiday:${res.publicId}:${order.publicId}%`))).toEqual([]);

    expect(await removeHoliday(res.publicId, 1n, "all")).toEqual({ restored: 0, left: 0, failed: [], removed: true, stillOwed: 0 });

    expect([(await rowById(wed.id)).status, (await rowById(wed.id)).holidayId]).toEqual(["scheduled", null]);
    expect(await db.select().from(outbox).where(like(outbox.dedupeKey, `holiday_removed:${res.publicId}:${order.publicId}%`))).toEqual([]);
  });
});
