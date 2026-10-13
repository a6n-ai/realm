import { beforeEach, describe, expect, it, vi } from "vitest";
import { and, asc, eq, ne } from "drizzle-orm";
import { nextWeekday, ValidationError } from "@foundry/commons";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

let failLapse = 0;
vi.mock("../pause-state", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../pause-state")>();
  return {
    ...actual,
    lapsePausedRows: (...args: Parameters<typeof actual.lapsePausedRows>) => {
      if (failLapse > 0) { failLapse--; return Promise.reject(new Error("lock timeout")); }
      return actual.lapsePausedRows(...args);
    },
  };
});

const deletedStops: string[] = [];
let failDelete = false;
vi.mock("@/lib/services/optimoroute/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/optimoroute/client")>();
  return { ...actual, deleteOrder: async (orderNo: string) => { if (failDelete) throw new Error("optimoroute down"); deletedStops.push(orderNo); } };
});

const pushedStops: string[][] = [];
let failPush = false;
vi.mock("@/lib/services/optimoroute/push", () => ({
  pushOneDelivery: async (orderNo: string, date: string) => {
    if (failPush) throw new Error("optimoroute push down");
    pushedStops.push([orderNo, date]);
  },
}));

const { db } = await import("@/db/client");
const { deliveries, deliveryMoves, durationPackages, ledgerEntries, orderActivities, orders, payments, subscriptionPauses, users } = await import("@/db/schema");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");
const { createOrder } = await import("../orders.service");
const { pauseDays, releasePausedDays, lapseElapsedPauses, lapseElapsedPausesSafe, lapseAllElapsedPauses, listPauseDays } = await import("../pause-days.service");
const { isOrderFullyPaused } = await import("../pause-state");
const { getPauseUsage } = await import("../pause-limits.service");
const { rescheduleDelivery, adminSetDeliveryStatus } = await import("../deliveries.service");
const { loadDayDeliveries } = await import("../daily-labels.service");
const { myActiveSubscriptions, myDeliveries } = await import("../customer-deliveries.service");
const { runCronJob } = await import("@/lib/cron/run");

const LIMIT_WEEKS = 5018;

async function reset() {
  await db.delete(subscriptionPauses);
  await db.delete(deliveries);
  await db.delete(ledgerEntries);
  await db.delete(orderActivities);
  await db.delete(payments);
  await db.delete(orders);
  await db.delete(users).where(ne(users.isSystem, true));
  await db.delete(durationPackages).where(eq(durationPackages.weeks, LIMIT_WEEKS));
  deletedStops.length = 0;
  failLapse = 0;
  failDelete = false;
  failPush = false;
  pushedStops.length = 0;
}

async function activatedOrder() {
  const snap = await loadCatalogSnapshot();
  const { publicId } = await createOrder({
    planKey: snap.plans[0].key,
    selections: {
      mealSizeId: snap.mealSizes[0].publicId, frequencyKey: "5_day", persons: 1, mealSlots: ["lunch"],
      includeSaturday: false, includeSunday: false, durationWeeks: 1,
      startDate: nextWeekday(new Date()).toISOString().slice(0, 10),
    },
    contact: { email: `u${Math.random().toString(36).slice(2)}@test.invalid`, fullName: "A B", phone: `+1647555${Math.floor(1000 + Math.random() * 9000)}`, addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6" },
  });
  const [o] = await db.select().from(orders).where(eq(orders.publicId, publicId));
  await db.delete(deliveries).where(eq(deliveries.orderId, o.id));
  const dates = ["2030-01-07", "2030-01-08", "2030-01-09", "2030-01-10", "2030-01-11"];
  await db.insert(deliveries).values(dates.map((deliveryDate) => ({
    orderId: o.id, deliveryDate, status: "scheduled" as const, cutoffAt: Date.now() + 1e9,
  })));
  return o;
}

async function rowsFor(id: bigint) {
  return db.select().from(deliveries).where(eq(deliveries.orderId, id)).orderBy(asc(deliveries.deliveryDate));
}

describe("pauseDays / releasePausedDays", () => {
  beforeEach(reset);

  it("pauses one day and a later day while the first is still paused", async () => {
    const o = await activatedOrder();
    await pauseDays(o.publicId, ["2030-01-07"], null);
    await expect(pauseDays(o.publicId, ["2030-01-09"], null)).resolves.toEqual({ paused: ["2030-01-09"], skipped: [] });
    const rows = await rowsFor(o.id);
    expect(rows.filter((r) => r.status === "paused").map((r) => r.deliveryDate)).toEqual(["2030-01-07", "2030-01-09"]);
    const [order] = await db.select().from(orders).where(eq(orders.id, o.id));
    expect(order.status).toBe("active");
    const usage = await getPauseUsage(o.id);
    expect(usage.count).toBe(2);
    expect(usage.daysUsed).toBe(2);
    expect(usage.hasOpenPause).toBe(false);
  });

  it("releases the middle day, then the rest, and refunds only the released days", async () => {
    const o = await activatedOrder();
    await pauseDays(o.publicId, ["2030-01-07", "2030-01-08", "2030-01-09"], null);
    await releasePausedDays(o.publicId, ["2030-01-08"], null);
    let rows = await rowsFor(o.id);
    expect(rows.find((r) => r.deliveryDate === "2030-01-08")!.status).toBe("scheduled");
    expect(rows.find((r) => r.deliveryDate === "2030-01-07")!.status).toBe("paused");
    expect((await getPauseUsage(o.id)).daysUsed).toBe(2);
    await releasePausedDays(o.publicId, "all", null);
    rows = await rowsFor(o.id);
    expect(rows.every((r) => r.status === "scheduled")).toBe(true);
    expect((await getPauseUsage(o.id)).daysUsed).toBe(0);
    expect((await getPauseUsage(o.id)).count).toBe(1);
  });

  it("refuses a day whose cutoff has passed", async () => {
    const o = await activatedOrder();
    await db.update(deliveries).set({ cutoffAt: Date.now() - 1000 }).where(eq(deliveries.deliveryDate, "2030-01-07"));
    await expect(pauseDays(o.publicId, ["2030-01-07"], null)).rejects.toBeInstanceOf(ValidationError);
  });

  it("a paused day past cutoff becomes a hold and is not put back on the schedule", async () => {
    const o = await activatedOrder();
    await pauseDays(o.publicId, ["2030-01-07"], null);
    await db.update(deliveries).set({ cutoffAt: Date.now() - 1000 }).where(eq(deliveries.deliveryDate, "2030-01-07"));
    await lapseElapsedPauses(o.id);
    const [row] = await rowsFor(o.id);
    expect(row.status).toBe("skipped");
    expect(row.routeSyncedAt).toBeNull();
    expect((await getPauseUsage(o.id)).daysUsed).toBe(1);
  });
});

const D = ["2030-01-07", "2030-01-08", "2030-01-09", "2030-01-10", "2030-01-11"] as const;

const rowOn = async (orderId: bigint, date: string) =>
  (await rowsFor(orderId)).find((r) => r.deliveryDate === date)!;
const orderStatus = async (id: bigint) => (await db.select().from(orders).where(eq(orders.id, id)))[0]!.status;
const expire = (orderId: bigint, date: string) =>
  db.update(deliveries).set({ cutoffAt: Date.now() - 1000 }).where(and(eq(deliveries.orderId, orderId), eq(deliveries.deliveryDate, date)));
const skippedNotes = async (orderId: bigint) =>
  (await db.select().from(orderActivities).where(and(eq(orderActivities.orderId, orderId), eq(orderActivities.type, "skipped"))))
    .filter((a) => a.note?.startsWith("Pause reached cutoff"));
async function limited(limits: { maxPauses?: number; maxPauseDaysTotal?: number; maxPauseStretchDays?: number }) {
  await db.delete(durationPackages).where(eq(durationPackages.weeks, LIMIT_WEEKS));
  await db.insert(durationPackages).values({
    weeks: LIMIT_WEEKS,
    maxPauses: limits.maxPauses ?? 99,
    maxPauseDaysTotal: limits.maxPauseDaysTotal ?? 99,
    maxPauseStretchDays: limits.maxPauseStretchDays ?? 99,
  });
  const o = await activatedOrder();
  await db.update(orders).set({ durationWeeks: LIMIT_WEEKS }).where(eq(orders.id, o.id));
  return o;
}

describe("D1: pausing days never changes orders.status (C1)", () => {
  beforeEach(reset);

  it("pausing every remaining day keeps the order active, so a locked delivery still reaches labels and the route", async () => {
    const o = await activatedOrder();
    await db.update(payments).set({ status: "paid" }).where(eq(payments.orderId, o.id));
    await expire(o.id, D[0]);
    await pauseDays(o.publicId, [D[1], D[2], D[3], D[4]], null);
    expect(await orderStatus(o.id)).toBe("active");
    const onTheTruck = await loadDayDeliveries(D[0]);
    expect(onTheTruck.map((r) => r.delivery.orderId)).toContain(o.id);
  });

  it("releasing never changes orders.status either", async () => {
    const o = await activatedOrder();
    await pauseDays(o.publicId, [...D], null);
    expect(await orderStatus(o.id)).toBe("active");
    await releasePausedDays(o.publicId, "all", null);
    expect(await orderStatus(o.id)).toBe("active");
  });

  it("fully paused is computed on read: paused days ahead and nothing scheduled today or later", async () => {
    const o = await activatedOrder();
    await pauseDays(o.publicId, [D[1], D[2], D[3], D[4]], null);
    expect(await isOrderFullyPaused(db, o.id, "2029-12-01")).toBe(false); // Mon is still going out
    await pauseDays(o.publicId, [D[0]], null);
    expect(await isOrderFullyPaused(db, o.id, "2029-12-01")).toBe(true);
    await releasePausedDays(o.publicId, [D[2]], null);
    expect(await isOrderFullyPaused(db, o.id, "2029-12-01")).toBe(false);
  });
});

describe("fully paused on read", () => {
  beforeEach(reset);
  it("the customer's plan reports fullyPaused while orders.status stays active", async () => {
    const o = await activatedOrder();
    expect((await myActiveSubscriptions(o.userId!))[0]!.fullyPaused).toBe(false);
    await pauseDays(o.publicId, [...D], null);
    const [sub] = await myActiveSubscriptions(o.userId!);
    expect([sub!.status, sub!.fullyPaused]).toEqual(["active", true]);
  });
});

describe("C2: a paused day whose tiffin was moved cannot be resumed", () => {
  beforeEach(reset);

  it("pause, Move to a new day, then Resume is refused and no second delivery appears", async () => {
    const o = await activatedOrder();
    await pauseDays(o.publicId, [D[1]], null);
    const paused = await rowOn(o.id, D[1]);
    await rescheduleDelivery(paused.publicId, "2030-01-14", null);

    await expect(releasePausedDays(o.publicId, [D[1]], null)).rejects.toBeInstanceOf(ValidationError);
    await expect(releasePausedDays(o.publicId, "all", null)).rejects.toBeInstanceOf(ValidationError);

    const rows = await rowsFor(o.id);
    expect(rows.find((r) => r.deliveryDate === D[1])!.status).not.toBe("scheduled");
    expect(rows.filter((r) => r.status === "scheduled" && r.deliveryDate >= D[1])).toHaveLength(4); // 09, 10, 11 and the make-up on the 14th
    expect(await listPauseDays(o.id)).not.toContainEqual({ date: D[1], paused: true });
    expect(await isOrderFullyPaused(db, o.id, "2029-12-01")).toBe(false);
  });

  it("a paused day merged into another trip cannot be resumed either, and the other paused days still can", async () => {
    const o = await activatedOrder();
    await pauseDays(o.publicId, [D[1], D[3]], null);
    await rescheduleDelivery((await rowOn(o.id, D[1])).publicId, D[2], null);
    expect((await rowOn(o.id, D[2])).tiffinUnits).toBe(2);

    await expect(releasePausedDays(o.publicId, [D[1]], null)).rejects.toBeInstanceOf(ValidationError);
    await expect(releasePausedDays(o.publicId, "all", null)).resolves.toEqual([D[3]]);
    const rows = await rowsFor(o.id);
    expect(rows.find((r) => r.deliveryDate === D[1])!.status).not.toBe("scheduled");
    expect(rows.find((r) => r.deliveryDate === D[3])!.status).toBe("scheduled");
    expect(rows.find((r) => r.deliveryDate === D[2])!.tiffinUnits).toBe(2);
  });
});

describe("C3: the cutoff converter runs wherever it can be noticed", () => {
  beforeEach(reset);

  it("pauseDays converts an elapsed paused day first, once", async () => {
    const o = await activatedOrder();
    await pauseDays(o.publicId, [D[0]], null);
    await expire(o.id, D[0]);
    await pauseDays(o.publicId, [D[2]], null);
    expect((await rowOn(o.id, D[0])).status).toBe("skipped");
    expect(await skippedNotes(o.id)).toHaveLength(1);
    await lapseElapsedPauses(o.id);
    expect(await skippedNotes(o.id)).toHaveLength(1);
  });

  it("releasePausedDays converts an elapsed paused day too", async () => {
    const o = await activatedOrder();
    await pauseDays(o.publicId, [D[0], D[2]], null);
    await expire(o.id, D[0]);
    await releasePausedDays(o.publicId, [D[2]], null);
    expect((await rowOn(o.id, D[0])).status).toBe("skipped");
    expect((await rowOn(o.id, D[2])).status).toBe("scheduled");
    expect(await skippedNotes(o.id)).toHaveLength(1);
  });

  it("the nightly complete-plans job converts stranded paused days on any order status, before it closes plans", async () => {
    const active = await activatedOrder();
    const legacy = await activatedOrder();
    for (const o of [active, legacy]) {
      await pauseDays(o.publicId, [D[0]], null);
      await expire(o.id, D[0]);
    }
    await db.update(orders).set({ status: "paused" }).where(eq(orders.id, legacy.id));

    const run = await runCronJob("complete-plans", "manual");
    expect(run).toMatchObject({ ok: true });
    for (const o of [active, legacy]) {
      expect((await rowOn(o.id, D[0])).status).toBe("skipped");
      expect(await skippedNotes(o.id)).toHaveLength(1);
    }
    expect(await orderStatus(active.id)).toBe("active");
    await runCronJob("complete-plans", "manual");
    expect(await skippedNotes(active.id)).toHaveLength(1);
    await expect(lapseAllElapsedPauses()).resolves.toEqual({ checked: 0, lapsed: 0, failed: 0 });
  });

  it("opening the customer's plans converts an elapsed paused day on an active order", async () => {
    const o = await activatedOrder();
    await pauseDays(o.publicId, [D[0]], null);
    await expire(o.id, D[0]);
    await myActiveSubscriptions(o.userId!);
    expect((await rowOn(o.id, D[0])).status).toBe("skipped");
    expect(await skippedNotes(o.id)).toHaveLength(1);
  });
});

describe("a failing conversion never takes anything else down", () => {
  beforeEach(reset);

  it("lapseAllElapsedPauses logs the order that fails and still converts the others", async () => {
    const a = await activatedOrder();
    const b = await activatedOrder();
    for (const o of [a, b]) {
      await pauseDays(o.publicId, [D[0]], null);
      await expire(o.id, D[0]);
    }
    failLapse = 1;
    await expect(lapseAllElapsedPauses()).resolves.toEqual({ checked: 2, lapsed: 1, failed: 1 });
    const statuses = [(await rowOn(a.id, D[0])).status, (await rowOn(b.id, D[0])).status].sort();
    expect(statuses).toEqual(["paused", "skipped"]);
  });

  it("the customer read resolves when the conversion fails, rows shown as they are", async () => {
    const o = await activatedOrder();
    await pauseDays(o.publicId, [D[0]], null);
    await expire(o.id, D[0]);
    failLapse = 1;
    await expect(myActiveSubscriptions(o.userId!)).resolves.toHaveLength(1);
    expect((await rowOn(o.id, D[0])).status).toBe("paused");
    await myActiveSubscriptions(o.userId!);
    expect((await rowOn(o.id, D[0])).status).toBe("skipped");
  });
});

describe("decisions pinned: partial move and make-up", () => {
  beforeEach(reset);

  it("a paused multi-day trip that lost one tiffin is still releasable and no units are lost", async () => {
    const o = await activatedOrder();
    await db.update(deliveries).set({ coversDates: [D[3], D[4]], tiffinUnits: 2 }).where(and(eq(deliveries.orderId, o.id), eq(deliveries.deliveryDate, D[3])));
    await db.delete(deliveries).where(and(eq(deliveries.orderId, o.id), eq(deliveries.deliveryDate, D[4])));
    const units = async () => (await rowsFor(o.id)).reduce((n, r) => n + (r.mergedIntoDeliveryId ? 0 : r.tiffinUnits), 0);
    const before = await units();
    await pauseDays(o.publicId, [D[3]], null);
    await rescheduleDelivery((await rowOn(o.id, D[3])).publicId, "2030-01-14", null, D[4]);
    const trip = await rowOn(o.id, D[3]);
    expect([trip.status, trip.tiffinUnits]).toEqual(["paused", 1]);
    await expect(releasePausedDays(o.publicId, [D[3]], null)).resolves.toEqual([D[3]]);
    expect((await rowOn(o.id, D[3])).status).toBe("scheduled");
    expect(await units()).toBe(before);
  });

  it("a scheduled make-up counts as going out: all originals paused plus a make-up is not fully paused", async () => {
    const o = await activatedOrder();
    const [src] = await rowsFor(o.id);
    await db.insert(deliveries).values({ orderId: o.id, deliveryDate: "2030-01-14", status: "scheduled", cutoffAt: Date.now() + 1e9, makeupForDeliveryId: src!.id, tiffinUnits: 1 });
    await pauseDays(o.publicId, [...D], null);
    expect(await isOrderFullyPaused(db, o.id, "2029-12-01")).toBe(false);
  });
});

describe("D4: when a lapsed pause or a hold can be moved", () => {
  beforeEach(reset);

  it("a lapsed pause (no route stop) is movable immediately", async () => {
    const o = await activatedOrder();
    await pauseDays(o.publicId, [D[0]], null);
    await expire(o.id, D[0]);
    await lapseElapsedPauses(o.id);
    const lapsed = await rowOn(o.id, D[0]);
    expect(lapsed.status).toBe("skipped");
    await expect(rescheduleDelivery(lapsed.publicId, "2030-01-14", null)).resolves.toMatchObject({ merged: false });
  });

  it("an elapsed pause nobody has converted yet is converted by Move and is movable too", async () => {
    const o = await activatedOrder();
    await pauseDays(o.publicId, [D[0]], null);
    await expire(o.id, D[0]);
    await expect(rescheduleDelivery((await rowOn(o.id, D[0])).publicId, "2030-01-14", null)).resolves.toMatchObject({ merged: false });
  });

  it("the customer view marks only the lapsed pause, not an ordinary hold", async () => {
    const o = await activatedOrder();
    await pauseDays(o.publicId, [D[0]], null);
    await expire(o.id, D[0]);
    await db.update(deliveries).set({ status: "skipped", cutoffAt: Date.now() - 1000 }).where(and(eq(deliveries.orderId, o.id), eq(deliveries.deliveryDate, D[1])));
    await myActiveSubscriptions(o.userId!);
    const rows = await myDeliveries(o.userId!, D[0], D[4]);
    expect(rows.map((r) => [r.deliveryDate, r.status, r.lapsedPause])).toEqual([
      [D[0], "skipped", true], [D[1], "skipped", false], [D[2], "scheduled", false], [D[3], "scheduled", false], [D[4], "scheduled", false],
    ]);
  });

  it("a pause staff re-opened and routed, then held, waits for the truck like any hold", async () => {
    const o = await activatedOrder();
    await pauseDays(o.publicId, [D[0]], null);
    const row = await rowOn(o.id, D[0]);
    await adminSetDeliveryStatus(row.publicId, "upcoming", null);
    await db.update(deliveries).set({ routeSyncedAt: Date.now() }).where(eq(deliveries.id, row.id));
    await expire(o.id, D[0]);
    await adminSetDeliveryStatus(row.publicId, "not_delivered", null);
    await expect(rescheduleDelivery(row.publicId, "2030-01-14", null)).rejects.toThrow(/on hold/i);
    const [shown] = await myDeliveries(o.userId!, D[0], D[0]);
    expect([shown!.status, shown!.lapsedPause]).toEqual(["skipped", false]);
  });

  it("any other hold keeps waiting until its delivery day is over", async () => {
    const o = await activatedOrder();
    await db.update(deliveries).set({ status: "skipped", cutoffAt: Date.now() - 1000 }).where(and(eq(deliveries.orderId, o.id), eq(deliveries.deliveryDate, D[0])));
    await expect(rescheduleDelivery((await rowOn(o.id, D[0])).publicId, "2030-01-14", null)).rejects.toThrow(/on hold/i);
  });
});

describe("I6: a day carrying a moved-in tiffin cannot be paused", () => {
  beforeEach(reset);

  it("is refused, so the paid tiffin can never lapse into a hold it cannot leave", async () => {
    const o = await activatedOrder();
    await rescheduleDelivery((await rowOn(o.id, D[0])).publicId, D[2], null);
    expect((await db.select().from(deliveryMoves).where(eq(deliveryMoves.orderId, o.id)))).toHaveLength(1);
    await expect(pauseDays(o.publicId, [D[2]], null)).rejects.toThrow(/moved/i);
    expect((await rowOn(o.id, D[2])).status).toBe("scheduled");
    expect(await listPauseDays(o.id)).not.toContainEqual({ date: D[2], paused: false });
    await expect(pauseDays(o.publicId, [D[3]], null)).resolves.toMatchObject({ paused: [D[3]] });
  });
});

describe("pause limits are enforced server-side, under the order lock", () => {
  beforeEach(reset);

  it("maxPauses: the second pause is refused, and two concurrent requests cannot both pass", async () => {
    const o = await limited({ maxPauses: 1 });
    await pauseDays(o.publicId, [D[0]], null);
    await expect(pauseDays(o.publicId, [D[1]], null)).rejects.toThrow("pause limit reached");

    const racer = await limited({ maxPauses: 1 });
    const results = await Promise.allSettled([pauseDays(racer.publicId, [D[0]], null), pauseDays(racer.publicId, [D[1]], null)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await getPauseUsage(racer.id)).count).toBe(1);
  });

  it("maxPauseDaysTotal: refuses past the total, and two concurrent requests cannot both pass", async () => {
    const o = await limited({ maxPauseDaysTotal: 2 });
    await pauseDays(o.publicId, [D[0], D[1]], null);
    await expect(pauseDays(o.publicId, [D[2]], null)).rejects.toThrow("pause days limit exceeded");

    const racer = await limited({ maxPauseDaysTotal: 3 });
    const results = await Promise.allSettled([pauseDays(racer.publicId, [D[0], D[1]], null), pauseDays(racer.publicId, [D[2], D[3]], null)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await getPauseUsage(racer.id)).daysUsed).toBeLessThanOrEqual(3);
  });

  it("maxPauseStretchDays: one action cannot pause more days than the stretch", async () => {
    const o = await limited({ maxPauseStretchDays: 2 });
    await expect(pauseDays(o.publicId, [D[0], D[1], D[2]], null)).rejects.toThrow("pause range too long");
    await expect(pauseDays(o.publicId, [D[0], D[1]], null)).resolves.toMatchObject({ paused: [D[0], D[1]] });
    expect((await rowOn(o.id, D[2])).status).toBe("scheduled");
  });

  it("a day released before cutoff is refunded; the action itself still counts", async () => {
    const o = await limited({ maxPauseDaysTotal: 2, maxPauses: 3 });
    await pauseDays(o.publicId, [D[0], D[1]], null);
    await releasePausedDays(o.publicId, [D[0]], null);
    expect(await getPauseUsage(o.id)).toMatchObject({ count: 1, daysUsed: 1 });
    await expect(pauseDays(o.publicId, [D[2]], null)).resolves.toMatchObject({ paused: [D[2]] });
    await expect(pauseDays(o.publicId, [D[3]], null)).rejects.toThrow("pause");
  });

  it("a pause that lapsed into a hold still counts as used", async () => {
    const o = await limited({ maxPauseDaysTotal: 2 });
    await pauseDays(o.publicId, [D[0], D[1]], null);
    await expire(o.id, D[0]);
    await lapseElapsedPauses(o.id);
    await releasePausedDays(o.publicId, [D[1]], null);
    expect((await getPauseUsage(o.id)).daysUsed).toBe(1);
    await expect(pauseDays(o.publicId, [D[2]], null)).resolves.toMatchObject({ paused: [D[2]] });
    await expect(pauseDays(o.publicId, [D[3]], null)).rejects.toThrow("pause days limit exceeded");
  });

  it("old range-shaped pause rows (no delivery_dates) are still counted by calendar span", async () => {
    const o = await limited({ maxPauseDaysTotal: 4 });
    await db.insert(subscriptionPauses).values({ orderId: o.id, fromDate: "2029-11-01", untilDate: "2029-11-03", isIndefinite: false, resumedAt: new Date() });
    expect(await getPauseUsage(o.id)).toMatchObject({ count: 1, daysUsed: 3 });
    await expect(pauseDays(o.publicId, [D[0], D[1]], null)).rejects.toThrow("pause days limit exceeded");
    await expect(pauseDays(o.publicId, [D[0]], null)).resolves.toMatchObject({ paused: [D[0]] });
  });
});

describe("pauseDays and releasePausedDays rules", () => {
  beforeEach(reset);

  it("refuses a trial", async () => {
    const o = await activatedOrder();
    await db.update(orders).set({ trialLength: 3 }).where(eq(orders.id, o.id));
    await expect(pauseDays(o.publicId, [D[0]], null)).rejects.toThrow(/trial/i);
    expect((await rowOn(o.id, D[0])).status).toBe("scheduled");
  });

  it("refuses a make-up row", async () => {
    const o = await activatedOrder();
    const [src] = await rowsFor(o.id);
    await db.insert(deliveries).values({ orderId: o.id, deliveryDate: "2030-01-14", status: "scheduled", cutoffAt: Date.now() + 1e9, makeupForDeliveryId: src!.id });
    await expect(pauseDays(o.publicId, ["2030-01-14"], null)).rejects.toBeInstanceOf(ValidationError);
    expect((await rowOn(o.id, "2030-01-14")).status).toBe("scheduled");
  });

  it("skips past-cutoff days instead of rejecting the whole selection", async () => {
    const o = await activatedOrder();
    await expire(o.id, D[0]);
    await expect(pauseDays(o.publicId, [D[0], D[1]], null)).resolves.toEqual({ paused: [D[1]], skipped: [D[0]] });
    expect((await rowOn(o.id, D[0])).status).toBe("scheduled");
    expect((await rowOn(o.id, D[1])).status).toBe("paused");
  });

  it("returns exactly the dates it changed: a release names only the days put back", async () => {
    const o = await activatedOrder();
    await pauseDays(o.publicId, [D[0], D[1], D[2]], null);
    await expire(o.id, D[0]);
    await expect(releasePausedDays(o.publicId, [D[0], D[1]], null)).resolves.toEqual([D[1]]);
  });

  it("takes the stop off OptimoRoute when pausing, and the released day is ready for the next push", async () => {
    const o = await activatedOrder();
    await db.update(payments).set({ status: "paid" }).where(eq(payments.orderId, o.id));
    const row = await rowOn(o.id, D[1]);
    await db.update(deliveries).set({ routeSyncedAt: Date.now(), routeDriverName: "Sam", routeStopNumber: 3 }).where(eq(deliveries.id, row.id));
    await pauseDays(o.publicId, [D[1]], null);
    expect(deletedStops).toEqual([row.publicId]);
    const paused = await rowOn(o.id, D[1]);
    expect([paused.routeSyncedAt, paused.routeDriverName, paused.routeStopNumber]).toEqual([null, null, null]);
    expect((await loadDayDeliveries(D[1])).some((r) => r.delivery.id === row.id)).toBe(false);

    await releasePausedDays(o.publicId, [D[1]], null);
    const back = await rowOn(o.id, D[1]);
    expect([back.status, back.routeSyncedAt]).toEqual(["scheduled", null]);
    expect((await loadDayDeliveries(D[1])).some((r) => r.delivery.id === row.id)).toBe(true);
  });
});

describe("lapse keeps the route evidence and stays quiet about moved-away rows", () => {
  beforeEach(reset);

  it("a paused row that still has a route stop when it lapses is not movable until its day ends", async () => {
    const o = await activatedOrder();
    await pauseDays(o.publicId, [D[0]], null);
    const row = await rowOn(o.id, D[0]);
    await db.update(deliveries).set({ routeSyncedAt: Date.now() }).where(eq(deliveries.id, row.id));
    await expire(o.id, D[0]);
    await lapseElapsedPauses(o.id);
    const lapsed = await rowOn(o.id, D[0]);
    expect([lapsed.status, lapsed.routeSyncedAt == null]).toEqual(["skipped", false]);
    const [shown] = await myDeliveries(o.userId!, D[0], D[0]);
    expect(shown!.lapsedPause).toBe(false);
    await expect(rescheduleDelivery(row.publicId, "2030-01-14", null)).rejects.toThrow(/on hold/i);
  });

  it("a failed stop delete leaves the route stamp on the paused row", async () => {
    const o = await activatedOrder();
    const row = await rowOn(o.id, D[1]);
    await db.update(deliveries).set({ routeSyncedAt: Date.now() }).where(eq(deliveries.id, row.id));
    failDelete = true;
    await pauseDays(o.publicId, [D[1]], null);
    failDelete = false;
    expect((await rowOn(o.id, D[1])).routeSyncedAt).not.toBeNull();
  });

  it("a paused row whose tiffin already left lapses without a misleading hold activity", async () => {
    const o = await activatedOrder();
    await pauseDays(o.publicId, [D[0]], null);
    const [target] = await db.select().from(deliveries).where(and(eq(deliveries.orderId, o.id), eq(deliveries.deliveryDate, D[2])));
    await db.update(deliveries).set({ mergedIntoDeliveryId: target!.id }).where(and(eq(deliveries.orderId, o.id), eq(deliveries.deliveryDate, D[0])));
    await expire(o.id, D[0]);
    await lapseElapsedPauses(o.id);
    expect(await skippedNotes(o.id)).toHaveLength(0);
    expect((await rowOn(o.id, D[0])).status).toBe("skipped");
    await lapseElapsedPauses(o.id);
    expect(await skippedNotes(o.id)).toHaveLength(0);
  });
});

describe("I1: orders.status = paused has no meaning, so it is retired wherever the lapse runs", () => {
  beforeEach(reset);

  const legacyPaused = async () => {
    const o = await activatedOrder();
    await db.update(payments).set({ status: "paid" }).where(eq(payments.orderId, o.id));
    await pauseDays(o.publicId, [...D], null);
    await db.update(orders).set({ status: "paused" }).where(eq(orders.id, o.id));
    return o;
  };
  const retired = async (id: bigint) => (await db.select().from(orderActivities).where(and(eq(orderActivities.orderId, id), eq(orderActivities.type, "status_change"))))
    .filter((a) => a.fromStatus === "paused" && a.toStatus === "active");

  it("resuming one of five days puts the order back on active, so the day reaches the labels", async () => {
    const o = await legacyPaused();
    await releasePausedDays(o.publicId, [D[1]], null);
    expect(await orderStatus(o.id)).toBe("active");
    expect((await rowOn(o.id, D[1])).status).toBe("scheduled");
    expect((await loadDayDeliveries(D[1])).some((r) => r.delivery.orderId === o.id)).toBe(true);
    expect(await retired(o.id)).toHaveLength(1);
  });

  it("Resume all on a paused order leaves it active", async () => {
    const o = await legacyPaused();
    await releasePausedDays(o.publicId, "all", null);
    expect(await orderStatus(o.id)).toBe("active");
  });

  it("pausing another day on a paused order also retires the status", async () => {
    const o = await legacyPaused();
    await releasePausedDays(o.publicId, [D[0]], null);
    await db.update(orders).set({ status: "paused" }).where(eq(orders.id, o.id));
    await pauseDays(o.publicId, [D[0]], null);
    expect(await orderStatus(o.id)).toBe("active");
  });

  it("the customer read and the admin page read retire it too", async () => {
    const a = await legacyPaused();
    await myActiveSubscriptions(a.userId!);
    expect(await orderStatus(a.id)).toBe("active");
    const b = await legacyPaused();
    await lapseElapsedPausesSafe(b.id);
    expect(await orderStatus(b.id)).toBe("active");
  });

  it("the nightly step flips a paused order nobody opened, once, and writes one activity", async () => {
    const o = await activatedOrder();
    await db.update(orders).set({ status: "paused" }).where(eq(orders.id, o.id));
    await runCronJob("complete-plans", "manual");
    expect(await orderStatus(o.id)).toBe("active");
    expect(await retired(o.id)).toHaveLength(1);
    await runCronJob("complete-plans", "manual");
    await lapseElapsedPauses(o.id);
    await myActiveSubscriptions(o.userId!);
    expect(await retired(o.id)).toHaveLength(1);
  });
});

describe("I2: the admin status select on a paused day", () => {
  beforeEach(reset);

  it("(a) past cutoff the pause lapses first, then the hold rules apply", async () => {
    const o = await activatedOrder();
    await pauseDays(o.publicId, [D[0]], null);
    await expire(o.id, D[0]);
    const row = await rowOn(o.id, D[0]);
    await expect(adminSetDeliveryStatus(row.publicId, "upcoming", null)).rejects.toThrow(/can't go back to this day/);
    expect((await rowOn(o.id, D[0])).status).not.toBe("scheduled");
    await adminSetDeliveryStatus(row.publicId, "not_delivered", null);
    expect((await rowOn(o.id, D[0])).status).toBe("skipped");
    expect(await skippedNotes(o.id)).toHaveLength(1);
  });

  it("(b) before cutoff Upcoming is a resume: log released, pause day refunded, stop restored", async () => {
    const o = await activatedOrder();
    await pauseDays(o.publicId, [D[0], D[1]], null);
    const row = await rowOn(o.id, D[0]);
    await adminSetDeliveryStatus(row.publicId, "upcoming", 7n);
    expect((await rowOn(o.id, D[0])).status).toBe("scheduled");
    expect((await getPauseUsage(o.id)).daysUsed).toBe(1);
    const [log] = await db.select().from(subscriptionPauses).where(eq(subscriptionPauses.orderId, o.id));
    expect(log!.releasedDates).toEqual([D[0]]);
    const resumedActs = await db.select().from(orderActivities).where(and(eq(orderActivities.orderId, o.id), eq(orderActivities.type, "resumed")));
    expect(resumedActs.map((a) => [a.note, a.createdBy])).toEqual([[D[0], 7n]]);
  });

  it("(c) before cutoff any other status is refused: resume the day first", async () => {
    const o = await activatedOrder();
    await pauseDays(o.publicId, [D[0]], null);
    const row = await rowOn(o.id, D[0]);
    for (const status of ["not_delivered", "delivered"] as const) {
      await expect(adminSetDeliveryStatus(row.publicId, status, null)).rejects.toThrow("Resume this day first");
    }
    expect((await rowOn(o.id, D[0])).status).toBe("paused");
    expect((await getPauseUsage(o.id)).daysUsed).toBe(1);
  });
});

describe("I3: a resumed day gets its stop back only when its date was already pushed", () => {
  beforeEach(reset);

  const markPushed = async (orderId: bigint, date: string) =>
    db.update(deliveries).set({ routeSyncedAt: Date.now() }).where(and(eq(deliveries.orderId, orderId), eq(deliveries.deliveryDate, date)));

  it("pushes that one stop when another delivery on the date is already on the route", async () => {
    const o = await activatedOrder();
    const other = await activatedOrder();
    await markPushed(other.id, D[1]);
    await pauseDays(o.publicId, [D[1], D[2]], null);
    await releasePausedDays(o.publicId, [D[1], D[2]], null);
    expect(pushedStops).toEqual([[(await rowOn(o.id, D[1])).publicId, D[1]]]);
  });

  it("does nothing when the date has not been pushed yet", async () => {
    const o = await activatedOrder();
    await pauseDays(o.publicId, [D[1]], null);
    await releasePausedDays(o.publicId, [D[1]], null);
    expect(pushedStops).toEqual([]);
  });

  it("the admin Upcoming resume restores the stop the same way", async () => {
    const o = await activatedOrder();
    const other = await activatedOrder();
    await markPushed(other.id, D[1]);
    await pauseDays(o.publicId, [D[1]], null);
    await adminSetDeliveryStatus((await rowOn(o.id, D[1])).publicId, "upcoming", null);
    expect(pushedStops).toHaveLength(1);
  });

  it("a push that throws never fails the release", async () => {
    const o = await activatedOrder();
    const other = await activatedOrder();
    await markPushed(other.id, D[1]);
    await pauseDays(o.publicId, [D[1]], null);
    failPush = true;
    await expect(releasePausedDays(o.publicId, [D[1]], null)).resolves.toEqual([D[1]]);
    expect((await rowOn(o.id, D[1])).status).toBe("scheduled");
  });
});

describe("listPauseDays", () => {
  beforeEach(reset);

  it("offers only days before their cutoff, so a day inside the cutoff can never be picked", async () => {
    const o = await activatedOrder();
    await expire(o.id, D[0]);
    await pauseDays(o.publicId, [D[1]], null);
    expect(await listPauseDays(o.id)).toEqual([
      { date: D[1], paused: true }, { date: D[2], paused: false }, { date: D[3], paused: false }, { date: D[4], paused: false },
    ]);
  });
});
