import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { nextWeekday } from "@foundry/commons";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { deleteNonSystemUsers } = await import("@/db/test-helpers");
const { orders, payments, orderActivities, ledgerEntries, subscriptionPauses, durationPackages, app } = await import("@/db/schema");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");
const svc = await import("../orders.service");
const { spanDays, getPauseLimits } = await import("../pause-limits.service");

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
  await deleteNonSystemUsers();
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
    contact: { email: `u${Math.random().toString(36).slice(2)}@test.invalid`,  fullName: "Jane", phone: "+16475550111", addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6" },
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

describe("spanDays", () => {
  it("counts inclusive calendar days", () => {
    expect(spanDays("2026-07-19", "2026-07-19")).toBe(1);
    expect(spanDays("2026-07-19", "2026-07-25")).toBe(7);
  });
});

describe("pause-limits (integration)", () => {
  beforeEach(reset);
  afterAll(reset);

  it("falls back to the app default when the package column is null", async () => {
    await insertPackage({ maxPauses: null, maxPauseDaysTotal: null, maxPauseStretchDays: null });
    await db.update(app).set({ defaultMaxPauses: 1, defaultMaxPauseDaysTotal: null, defaultMaxPauseStretchDays: null });
    const orderId = await makeOrder(TEST_WEEKS);

    const limits = await getPauseLimits(orderId);
    expect(limits.maxPauses).toBe(1);
  });
});
