import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { nextWeekday } from "@foundry/commons";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
vi.mock("@foundry/places", async (orig) => ({ ...(await orig<object>()), resolveAndPersist: async () => null }));
// OptimoRoute is never called from tests: each pulled day answers from `optimoSays`.
const optimoSays = new Map<string, { date: string; action: "confirmed" | "skipped" }>();
const pulledDays: string[] = [];
vi.mock("@/lib/services/optimoroute/completions", () => ({
  pullCompletions: async (date: string) => {
    pulledDays.push(date);
    const outcomes = [...optimoSays].filter(([, o]) => o.date === date)
      .map(([deliveryPublicId, o]) => ({ deliveryPublicId, customerName: "", optimoStatus: null, action: o.action, tiffinUnits: 1, coverage: null }));
    return { date, outcomes: [...outcomes, { deliveryPublicId: "dlv_someone_else", action: "confirmed" }], ambiguous: [], pendingCount: 0, unmatched: [], settled: [] };
  },
}));

const { db } = await import("@/db/client");
const { deliveries, ledgerEntries, orderActivities, orders, payments, users } = await import("@/db/schema");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");
const { createOrder } = await import("../orders.service");
const { listMissedDeliveries, countMissedDeliveries, reconcileMissedDeliveries, moveMissedDelivery } = await import("../missed-deliveries.service");

const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);
const PAST = Date.now() - 86_400_000;

let order: typeof orders.$inferSelect;
const ids: Record<string, string> = {};

// Scoped to this suite's own order: other suites share the database, so the list is filtered to it.
async function cleanup() {
  if (!order) return;
  await db.delete(deliveries).where(eq(deliveries.orderId, order.id));
  await db.delete(orderActivities).where(eq(orderActivities.orderId, order.id));
  await db.delete(ledgerEntries).where(eq(ledgerEntries.orderId, order.id));
  await db.delete(payments).where(eq(payments.orderId, order.id));
  await db.delete(orders).where(eq(orders.id, order.id));
  if (order.userId) await db.delete(users).where(eq(users.id, order.userId));
}

describe("missed deliveries (integration)", () => {
  beforeAll(async () => {
    const snap = await loadCatalogSnapshot();
    const { publicId } = await createOrder({
      planKey: snap.plans[0].key,
      selections: {
        mealSizeId: snap.mealSizes[0].publicId, frequencyKey: "5_day", persons: 1, mealSlots: ["lunch"],
        includeSaturday: false, includeSunday: false, durationWeeks: 1,
        startDate: nextWeekday(new Date()).toISOString().slice(0, 10),
      },
      contact: { email: `missed${Math.random().toString(36).slice(2)}@test.invalid`, fullName: "Missed Tester", phone: `+1647555${String(Math.floor(Math.random() * 10000)).padStart(4, "0")}`, addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6" },
    });
    [order] = await db.select().from(orders).where(eq(orders.publicId, publicId));
    await db.delete(deliveries).where(eq(deliveries.orderId, order.id));

    const add = async (key: string, v: Partial<typeof deliveries.$inferInsert> & { deliveryDate: string }) => {
      const [row] = await db.insert(deliveries).values({ orderId: order.id, status: "scheduled", cutoffAt: PAST, ...v }).returning();
      ids[key] = row!.publicId;
      return row!;
    };
    await add("notSent", { deliveryDate: iso(-10) });
    await add("noConfirmation", { deliveryDate: iso(-9), routeSyncedAt: PAST });
    await add("delivered", { deliveryDate: iso(-8), routeSyncedAt: PAST, optimoCompletionStatus: "success" });
    await add("held", { deliveryDate: iso(-7), status: "skipped" });
    await add("failed", { deliveryDate: iso(-6), status: "skipped", optimoCompletionStatus: "failed" });
    await add("today", { deliveryDate: iso(0) });
    const compensated = await add("compensated", { deliveryDate: iso(-5) });
    await add("freeTiffin", { deliveryDate: iso(3), cutoffAt: Date.now() + 1e9, complimentaryForDeliveryId: compensated.id });
  });
  afterAll(cleanup);

  const mine = async () => (await listMissedDeliveries("all")).filter((r) => r.orderPublicId === order.publicId);

  it("lists past scheduled days OptimoRoute never confirmed, and why", async () => {
    const rows = await mine();
    expect(rows.map((r) => [r.deliveryPublicId, r.kind])).toEqual([
      [ids.noConfirmation, "no_confirmation"],
      [ids.notSent, "not_sent"],
    ]);
    expect(rows[0]).toMatchObject({ orderCode: order.deploymentId, customerName: "Missed Tester", tiffinUnits: 1 });
  });

  it("leaves out delivered, held, failed (already pooled), today, and days a free tiffin settled", async () => {
    const listed = new Set((await mine()).map((r) => r.deliveryPublicId));
    for (const key of ["delivered", "held", "failed", "today", "compensated", "freeTiffin"]) expect(listed.has(ids[key]!)).toBe(false);
  });

  it("reconcile pulls each missed day once and counts only listed deliveries", async () => {
    optimoSays.set(ids.notSent!, { date: iso(-10), action: "confirmed" }).set(ids.noConfirmation!, { date: iso(-9), action: "skipped" });
    const r = await reconcileMissedDeliveries("all", null);
    optimoSays.clear();
    expect(new Set(pulledDays).size).toBe(pulledDays.length);
    expect(pulledDays).toEqual(expect.arrayContaining([iso(-10), iso(-9)]));
    expect(r).toMatchObject({ delivered: 1, notDelivered: 1, days: pulledDays.length });
  });

  it("drops a day once it is marked delivered, and a cancelled plan's days are void", async () => {
    await db.update(deliveries).set({ optimoCompletionStatus: "success" }).where(eq(deliveries.publicId, ids.noConfirmation!));
    expect((await mine()).map((r) => r.deliveryPublicId)).toEqual([ids.notSent]);
    await db.update(orders).set({ status: "cancelled" }).where(eq(orders.id, order.id));
    expect(await mine()).toEqual([]);
  });

  it("scopes to the caller's organizations", async () => {
    await db.update(orders).set({ status: "active" }).where(eq(orders.id, order.id));
    expect(await countMissedDeliveries([])).toBe(0);
    const other = (await listMissedDeliveries(["org-that-does-not-exist"])).filter((r) => r.orderPublicId === order.publicId);
    expect(other).toEqual([]);
    expect((await mine()).length).toBe(1);
  });

  // Two weeks out on a weekday: a plan day whose cutoff is well ahead.
  const weekdayAhead = () => {
    const d = new Date(Date.now() + 14 * 86_400_000);
    while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  };

  it("a refused move leaves the day missed, as it was", async () => {
    await expect(moveMissedDelivery(ids.notSent!, iso(-2), null)).rejects.toThrow("past");
    const [row] = await db.select().from(deliveries).where(eq(deliveries.publicId, ids.notSent!));
    expect(row!.status).toBe("scheduled");
    expect((await mine()).map((r) => r.deliveryPublicId)).toEqual([ids.notSent]);
    const notes = await db.select({ note: orderActivities.note }).from(orderActivities).where(eq(orderActivities.orderId, order.id));
    expect(notes.some((n) => n.note?.startsWith("Missed "))).toBe(false);
  });

  it("move holds the missed day and puts its tiffin on the picked day", async () => {
    const target = weekdayAhead();
    expect(await moveMissedDelivery(ids.notSent!, target, null)).toEqual({ carriedOn: target });
    const [source] = await db.select().from(deliveries).where(eq(deliveries.publicId, ids.notSent!));
    expect(source!.status).toBe("skipped");
    const onTarget = await db.select().from(deliveries).where(eq(deliveries.orderId, order.id));
    expect(onTarget.some((d) => d.deliveryDate === target && d.status === "scheduled")).toBe(true);
    expect(await mine()).toEqual([]);
    await expect(moveMissedDelivery(ids.notSent!, target, null)).rejects.toThrow("no longer missed");
  });
});

