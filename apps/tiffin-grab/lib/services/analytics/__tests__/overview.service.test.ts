import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ne } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
vi.mock("@/lib/auth/session", () => ({ getSession: async () => null }));

const { db } = await import("@/db/client");
const { deliveries, deliveryFrequencies, mealSizes, orders, payments, plans, users } = await import("@/db/schema");
const { getTrialToPlanConversion } = await import("../overview.service");
const { buildAnalyticsScope } = await import("../metrics/scope");

const TZ = "America/Toronto";
const at = (iso: string) => Date.parse(iso);
// Range: all of March 2026. Trials end in early March, so their 14-day window closes mid-March.
const NOW = at("2026-04-15T16:00:00Z");
const scope = buildAnalyticsScope({ from: String(at("2026-03-01T05:00:00Z")), to: String(at("2026-03-31T20:00:00Z")) }, "all", TZ, NOW);

async function reset() {
  await db.delete(deliveries);
  await db.delete(payments);
  await db.delete(orders);
  await db.delete(users).where(ne(users.isSystem, true));
}

let n = 0;
async function makeUser() {
  const k = n++;
  const [u] = await db.insert(users).values({ email: `trial${k}-${Math.random().toString(36).slice(2)}@x.test`, name: `t${k}`, role: "user" }).returning();
  return u!;
}

async function makeOrder(userId: bigint, over: { trial?: boolean; status?: string; startDate: string; lastDelivery: string; paid?: boolean }) {
  const [[plan], [mealSize], [freq]] = await Promise.all([
    db.select({ id: plans.id }).from(plans).limit(1),
    db.select({ id: mealSizes.id }).from(mealSizes).limit(1),
    db.select({ id: deliveryFrequencies.id }).from(deliveryFrequencies).limit(1),
  ]);
  const [o] = await db
    .insert(orders)
    .values({
      userId,
      planId: plan!.id,
      mealSizeId: mealSize!.id,
      frequencyId: freq!.id,
      durationWeeks: 1,
      startDate: over.startDate,
      tiffinCount: 5,
      perTiffinPrice: "10.00",
      pricingSnapshot: {},
      total: "50.00",
      trialLength: over.trial ? 3 : null,
      status: (over.status ?? "active") as never,
      deploymentId: `SUB-T${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      fullName: "Fixture",
      addressLine: "1 St",
      city: "Toronto",
      postalCode: "M5V 2T6",
    })
    .returning();
  await db.insert(deliveries).values({ orderId: o!.id, deliveryDate: over.lastDelivery, status: "scheduled", cutoffAt: NOW, tiffinUnits: 1 });
  if (over.paid) await db.insert(payments).values({ orderId: o!.id, amount: "50.00", status: "paid", method: "stripe", capturedAt: NOW } as never);
  return o!;
}

describe("trial to plan conversion", () => {
  beforeEach(reset);
  afterAll(reset);

  it("leaves trials still inside their 14-day window out of the rate", async () => {
    const closed = await makeUser();
    const open = await makeUser();
    await makeOrder(closed.id, { trial: true, startDate: "2026-03-02", lastDelivery: "2026-03-04", paid: true });
    // Ends Mar 31 -> window closes Apr 14; "today" is Apr 15, so close it by moving today earlier below.
    await makeOrder(open.id, { trial: true, startDate: "2026-03-30", lastDelivery: "2026-03-31", paid: true });
    const stats = await getTrialToPlanConversion(scope, at("2026-04-10T16:00:00Z"));
    expect(stats).toMatchObject({ eligible: 1, open: 1, converted: 0, conversionRatePct: 0 });
    const later = await getTrialToPlanConversion(scope, NOW);
    expect(later).toMatchObject({ eligible: 2, open: 0 });
  });

  it("counts an unpaid later plan as converted but not a cancelled one", async () => {
    const unpaid = await makeUser();
    const cancelled = await makeUser();
    const none = await makeUser();
    for (const u of [unpaid, cancelled, none]) await makeOrder(u.id, { trial: true, startDate: "2026-03-02", lastDelivery: "2026-03-04", paid: true });
    await makeOrder(unpaid.id, { status: "pending", startDate: "2026-03-09", lastDelivery: "2026-03-20" });
    await makeOrder(cancelled.id, { status: "cancelled", startDate: "2026-03-09", lastDelivery: "2026-03-20" });
    const stats = await getTrialToPlanConversion(scope, NOW);
    expect(stats).toMatchObject({ eligible: 3, converted: 1, open: 0 });
  });

  it("ignores cancelled-unpaid trials and trials ending outside the range", async () => {
    const u = await makeUser();
    await makeOrder(u.id, { trial: true, status: "cancelled", startDate: "2026-03-02", lastDelivery: "2026-03-04" });
    await makeOrder(u.id, { trial: true, startDate: "2026-02-02", lastDelivery: "2026-02-04", paid: true });
    const stats = await getTrialToPlanConversion(scope, NOW);
    expect(stats).toMatchObject({ eligible: 0, open: 0, conversionRatePct: null });
  });
});
