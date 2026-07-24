import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { asc, eq, ne } from "drizzle-orm";
import { nextWeekday, ValidationError } from "@realm/commons";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { deliveries, ledgerEntries, orderActivities, orders, payments, users } = await import("@/db/schema");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");
const { activateOrder, cancelOrder, createOrder, ordersService } = await import("../orders.service");
const { reconcilePoolFromMisses, maybeComplete, skipDelivery } = await import("../deliveries.service");

async function reset() {
  await db.delete(deliveries);
  await db.delete(ledgerEntries);
  await db.delete(orderActivities);
  await db.delete(payments);
  await db.delete(orders);
  await db.delete(users).where(ne(users.isSystem, true));
}

// M5V is a seeded Toronto zone -> lands "active" with materialized rows.
async function makeOrder(durationWeeks = 1) {
  const snap = await loadCatalogSnapshot();
  const { publicId } = await createOrder({
    planKey: snap.plans[0].key,
    selections: {
      mealSizeId: snap.mealSizes[0].publicId,
      frequencyKey: "5_day",
      persons: 1,
      mealSlots: ["lunch"],
      includeSaturday: false,
      includeSunday: false,
      durationWeeks,
      startDate: nextWeekday(new Date()).toISOString().slice(0, 10),
    },
    contact: { fullName: "A B", phone: "+16475550111", addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6" },
  });
  const [o] = await db.select().from(orders).where(eq(orders.publicId, publicId));
  return o;
}

// K1A (Ottawa) matches no seeded zone -> genuinely "waitlisted" with zero delivery rows.
async function makeWaitlistedOrder() {
  const snap = await loadCatalogSnapshot();
  const { publicId } = await createOrder({
    planKey: snap.plans[0].key,
    selections: {
      mealSizeId: snap.mealSizes[0].publicId,
      frequencyKey: "5_day",
      persons: 1,
      mealSlots: ["lunch"],
      includeSaturday: false,
      includeSunday: false,
      durationWeeks: 1,
      startDate: nextWeekday(new Date()).toISOString().slice(0, 10),
    },
    contact: { fullName: "C D", phone: "+16135550111", addressLine: "1 St", city: "Ottawa", postalCode: "K1A 0A1" },
  });
  const [o] = await db.select().from(orders).where(eq(orders.publicId, publicId));
  return o;
}

async function rowsFor(o: { id: bigint }) {
  return db.select().from(deliveries).where(eq(deliveries.orderId, o.id)).orderBy(asc(deliveries.deliveryDate));
}

describe("cancel() voids rows + debt, completed status, frozen duration/frequency (integration)", () => {
  beforeEach(reset);
  afterAll(reset);

  it("cancel marks every scheduled/paused row cancelled, make-ups included, and deletes nothing", async () => {
    const o = await makeOrder();
    const before = await rowsFor(o);
    expect(before.length).toBeGreaterThan(0);
    const beforeCount = before.length;
    const beforeOriginalsCount = before.filter((r) => r.makeupForDeliveryId === null).length;

    // Pause one row and manually plant a "make-up" row (a scheduled row with a
    // non-null makeupForDeliveryId) so cancellation is proven to reach make-ups too.
    await db.update(deliveries).set({ status: "paused" }).where(eq(deliveries.id, before[0].id));
    const [makeup] = await db.insert(deliveries).values({
      orderId: o.id,
      deliveryDate: "2031-01-01",
      status: "scheduled",
      cutoffAt: Date.now() + 1e9,
      makeupForDeliveryId: before[1].id,
    }).returning();

    await cancelOrder(o.publicId);

    const after = await rowsFor(o);
    expect(after.length).toBe(beforeCount + 1); // nothing deleted, the planted make-up still exists
    expect(after.every((r) => r.status === "cancelled")).toBe(true);
    const afterMakeup = after.find((r) => r.id === makeup.id)!;
    expect(afterMakeup.status).toBe("cancelled");
    // Direct proof that originals are never deleted, not just inferred from the total count.
    const afterOriginalsCount = after.filter((r) => r.makeupForDeliveryId === null).length;
    expect(afterOriginalsCount).toBe(beforeOriginalsCount);

    const [order] = await db.select().from(orders).where(eq(orders.id, o.id));
    expect(order.status).toBe("cancelled");
  });

  it("voids make-up debt: reconcilePoolFromMisses returns 0 after cancel even with a missed original lacking a make-up", async () => {
    const o = await makeOrder();
    const rows = await rowsFor(o);
    // A missed original: skipped, past its own cutoff, no make-up row exists for it.
    await db.update(deliveries)
      .set({ status: "skipped", cutoffAt: Date.now() - 1000 })
      .where(eq(deliveries.id, rows[0].id));

    await cancelOrder(o.publicId);

    await expect(reconcilePoolFromMisses(o.id)).resolves.toBe(0);
    const after = await rowsFor(o);
    expect(after.length).toBe(rows.length); // still nothing created
  });

  it("a cancelled order cannot be re-activated", async () => {
    const o = await makeOrder();
    await cancelOrder(o.publicId);
    await expect(activateOrder(o.publicId)).rejects.toBeInstanceOf(ValidationError);
  });

  it("maybeComplete does NOT flip when every original is skipped but none are past cutoff (live make-up debt)", async () => {
    const o = await makeOrder();
    await db.update(deliveries).set({ status: "skipped" }).where(eq(deliveries.orderId, o.id));

    // Cutoffs are still in the future: this is unmaterialized make-up debt, not completion.
    await expect(maybeComplete(o.id)).resolves.toBe(false);
    const [order] = await db.select().from(orders).where(eq(orders.id, o.id));
    expect(order.status).toBe("active");
  });

  it("maybeComplete does not flip a cancelled order, and returns false while rows remain", async () => {
    const o = await makeOrder();
    await expect(maybeComplete(o.id)).resolves.toBe(false); // rows still scheduled, future dated
    let [order] = await db.select().from(orders).where(eq(orders.id, o.id));
    expect(order.status).toBe("active");

    await cancelOrder(o.publicId);
    await expect(maybeComplete(o.id)).resolves.toBe(false); // never promotes a cancelled order
    [order] = await db.select().from(orders).where(eq(orders.id, o.id));
    expect(order.status).toBe("cancelled"); // never promoted from cancelled
  });

  it("maybeComplete refuses to complete an order with make-up debt, even after cutoffs pass and reconcilePoolFromMisses pools the misses", async () => {
    const o = await makeOrder();
    const rows = await rowsFor(o);
    for (const r of rows) await skipDelivery(r.publicId, 1n); // legal: all cutoffs still future

    await expect(maybeComplete(o.id)).resolves.toBe(false);
    let [order] = await db.select().from(orders).where(eq(orders.id, o.id));
    expect(order.status).toBe("active");

    // Force every cutoff into the past and let the worker pool the owed tiffins.
    await db.update(deliveries).set({ cutoffAt: Date.now() - 1000 }).where(eq(deliveries.orderId, o.id));
    const pooled = await reconcilePoolFromMisses(o.id);
    expect(pooled).toBe(rows.length); // persons = 1, so one tiffin per missed day

    // The pooled misses have no make-up date yet: still debt, so the order stays open.
    await expect(maybeComplete(o.id)).resolves.toBe(false);
    [order] = await db.select().from(orders).where(eq(orders.id, o.id));
    expect(order.status).toBe("active");
  });

  // Distinct past weekday dates (Mon-Fri, 2020-01-06..10) — deliveries has UNIQUE(order_id, delivery_date).
  const PAST_DATES = ["2020-01-06", "2020-01-07", "2020-01-08", "2020-01-09", "2020-01-10"];

  async function backdateAllRows(o: { id: bigint }) {
    const rows = await rowsFor(o);
    for (const [i, r] of rows.entries()) {
      await db.update(deliveries)
        .set({ deliveryDate: PAST_DATES[i % PAST_DATES.length], cutoffAt: Date.now() - 1000 })
        .where(eq(deliveries.id, r.id));
    }
  }

  it("maybeComplete completes an order whose every delivery is past-dated, scheduled, with no unresolved debt", async () => {
    const o = await makeOrder();
    await backdateAllRows(o);

    await expect(maybeComplete(o.id)).resolves.toBe(true);
    const [order] = await db.select().from(orders).where(eq(orders.id, o.id));
    expect(order.status).toBe("completed");
  });

  it("maybeComplete stays false when all dates are past but one original is skipped with no make-up yet", async () => {
    const o = await makeOrder();
    const rows = await rowsFor(o);
    await backdateAllRows(o);
    await db.update(deliveries).set({ status: "skipped" }).where(eq(deliveries.id, rows[0].id));

    await expect(maybeComplete(o.id)).resolves.toBe(false);
    const [order] = await db.select().from(orders).where(eq(orders.id, o.id));
    expect(order.status).toBe("active");
  });

  it("throws when updating durationWeeks or frequencyId on an order that already has delivery rows", async () => {
    const o = await makeOrder();
    await expect(ordersService.update(o.publicId, { durationWeeks: 2 })).rejects.toBeInstanceOf(ValidationError);
    await expect(ordersService.update(o.publicId, { frequencyId: 999n })).rejects.toBeInstanceOf(ValidationError);
  });

  it("the same update succeeds on an order with no delivery rows yet", async () => {
    const o = await makeWaitlistedOrder();
    const rows = await rowsFor(o);
    expect(rows.length).toBe(0);
    await expect(ordersService.update(o.publicId, { durationWeeks: 3 })).resolves.toBeDefined();
    const [order] = await db.select().from(orders).where(eq(orders.id, o.id));
    expect(order.durationWeeks).toBe(3);
  });
});
