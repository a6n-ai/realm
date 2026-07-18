import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, ne } from "drizzle-orm";
import { nextWeekday } from "@realm/commons";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { orders, payments, orderActivities, ledgerEntries, users, subscriptionPauses, durationPackages, app } = await import("@/db/schema");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");
const svc = await import("../orders.service");
const { spanDays, getPauseLimits, assertPauseAllowed } = await import("../pause-limits.service");

// Reserved duration-package "weeks" value for this suite — no real catalog package
// uses it, so mutating/deleting rows at this key can't collide with other tests.
const TEST_WEEKS = 5017;

let originalAppDefaults: {
  maxPauses: number | null;
  maxPauseDaysTotal: number | null;
  maxPauseStretchDays: number | null;
};

beforeAll(async () => {
  const [row] = await db
    .select({
      maxPauses: app.defaultMaxPauses,
      maxPauseDaysTotal: app.defaultMaxPauseDaysTotal,
      maxPauseStretchDays: app.defaultMaxPauseStretchDays,
    })
    .from(app)
    .limit(1);
  originalAppDefaults = row;
});

async function reset() {
  await db.delete(subscriptionPauses);
  await db.delete(ledgerEntries);
  await db.delete(orderActivities);
  await db.delete(payments);
  await db.delete(orders);
  await db.delete(users).where(ne(users.isSystem, true));
  await db.delete(durationPackages).where(eq(durationPackages.weeks, TEST_WEEKS));
  if (originalAppDefaults) {
    await db.update(app).set({
      defaultMaxPauses: originalAppDefaults.maxPauses,
      defaultMaxPauseDaysTotal: originalAppDefaults.maxPauseDaysTotal,
      defaultMaxPauseStretchDays: originalAppDefaults.maxPauseStretchDays,
    });
  }
}

async function makeOrder(weeks: number): Promise<bigint> {
  const snap = await loadCatalogSnapshot();
  const { publicId } = await svc.createOrder({
    planKey: snap.plans[0].key,
    selections: {
      mealSizeId: snap.mealSizes[0].publicId, frequencyKey: "5_day", persons: 1, mealSlots: ["lunch"],
      includeSaturday: false, includeSunday: false, durationWeeks: 1,
      startDate: nextWeekday(new Date()).toISOString().slice(0, 10),
    },
    contact: { fullName: "Jane", phone: "+16475550111", addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6" },
  });
  const [order] = await db.select().from(orders).where(eq(orders.publicId, publicId));
  await db.update(orders).set({ durationWeeks: weeks }).where(eq(orders.id, order.id));
  return order.id as bigint;
}

async function insertPackage(limits: {
  maxPauses?: number | null;
  maxPauseDaysTotal?: number | null;
  maxPauseStretchDays?: number | null;
}) {
  await db.insert(durationPackages).values({
    weeks: TEST_WEEKS,
    maxPauses: limits.maxPauses ?? null,
    maxPauseDaysTotal: limits.maxPauseDaysTotal ?? null,
    maxPauseStretchDays: limits.maxPauseStretchDays ?? null,
  });
}

async function insertPause(orderId: bigint, from: string, until: string, opts: { open?: boolean } = {}) {
  await db.insert(subscriptionPauses).values({
    orderId,
    fromDate: from,
    untilDate: until,
    isIndefinite: false,
    resumedAt: opts.open ? null : new Date(),
  });
}

describe("spanDays", () => {
  it("counts inclusive calendar days", () => {
    expect(spanDays("2026-07-19", "2026-07-19")).toBe(1);
    expect(spanDays("2026-07-19", "2026-07-25")).toBe(7);
  });
});

describe("pause-limits (integration)", () => {
  beforeEach(reset);
  afterAll(reset);

  it("rejects a 3rd pause after 2 recorded", async () => {
    await insertPackage({ maxPauses: 2, maxPauseDaysTotal: 10, maxPauseStretchDays: 7 });
    const orderId = await makeOrder(TEST_WEEKS);
    await insertPause(orderId, "2026-08-01", "2026-08-02");
    await insertPause(orderId, "2026-08-05", "2026-08-06");
    await expect(assertPauseAllowed(orderId, "2026-08-10", "2026-08-11", false)).rejects.toThrow("pause limit reached");
  });

  it("rejects a range whose span + prior daysUsed exceeds the total-days cap", async () => {
    await insertPackage({ maxPauses: 2, maxPauseDaysTotal: 10, maxPauseStretchDays: 7 });
    const orderId = await makeOrder(TEST_WEEKS);
    // 5 days used already; a further 6-day span pushes total to 11 > 10.
    await insertPause(orderId, "2026-08-01", "2026-08-05");
    await expect(assertPauseAllowed(orderId, "2026-08-10", "2026-08-15", false)).rejects.toThrow("pause days limit");
  });

  it("rejects a single range longer than the stretch cap", async () => {
    await insertPackage({ maxPauses: 2, maxPauseDaysTotal: 10, maxPauseStretchDays: 7 });
    const orderId = await makeOrder(TEST_WEEKS);
    // 8-day span > 7-day stretch cap.
    await expect(assertPauseAllowed(orderId, "2026-08-01", "2026-08-08", false)).rejects.toThrow("pause range too long");
  });

  it("rejects indefinite pauses when maxPauseStretchDays is non-null", async () => {
    await insertPackage({ maxPauses: 2, maxPauseDaysTotal: 10, maxPauseStretchDays: 7 });
    const orderId = await makeOrder(TEST_WEEKS);
    await expect(assertPauseAllowed(orderId, "2026-08-01", "2026-08-01", true)).rejects.toThrow("indefinite pause not allowed");
  });

  it("rejects when an open pause already exists", async () => {
    await insertPackage({ maxPauses: null, maxPauseDaysTotal: null, maxPauseStretchDays: null });
    const orderId = await makeOrder(TEST_WEEKS);
    await insertPause(orderId, "2026-08-01", "2026-08-02", { open: true });
    await expect(assertPauseAllowed(orderId, "2026-08-10", "2026-08-11", false)).rejects.toThrow("already paused");
  });

  it("allows everything when package columns and app defaults are both null (unlimited)", async () => {
    await insertPackage({ maxPauses: null, maxPauseDaysTotal: null, maxPauseStretchDays: null });
    await db.update(app).set({
      defaultMaxPauses: null,
      defaultMaxPauseDaysTotal: null,
      defaultMaxPauseStretchDays: null,
    });
    const orderId = await makeOrder(TEST_WEEKS);
    await expect(assertPauseAllowed(orderId, "2026-08-01", "2028-08-01", true)).resolves.toBeUndefined();
  });

  it("falls back to the app default when the package column is null", async () => {
    await insertPackage({ maxPauses: null, maxPauseDaysTotal: null, maxPauseStretchDays: null });
    await db.update(app).set({ defaultMaxPauses: 1, defaultMaxPauseDaysTotal: null, defaultMaxPauseStretchDays: null });
    const orderId = await makeOrder(TEST_WEEKS);

    const limits = await getPauseLimits(orderId);
    expect(limits.maxPauses).toBe(1);

    await insertPause(orderId, "2026-08-01", "2026-08-02");
    await expect(assertPauseAllowed(orderId, "2026-08-10", "2026-08-11", false)).rejects.toThrow("pause limit reached");
  });
});
