import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { asc, eq, ne } from "drizzle-orm";
import { nextWeekday, ValidationError } from "@realm/commons";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { deliveries, ledgerEntries, orderActivities, orders, payments, users } = await import("@/db/schema");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");
const { createOrder } = await import("../orders.service");
const { pauseRange, resumeOrder, skipDelivery } = await import("../deliveries.service");

async function reset() {
  await db.delete(deliveries);
  await db.delete(ledgerEntries);
  await db.delete(orderActivities);
  await db.delete(payments);
  await db.delete(orders);
  await db.delete(users).where(ne(users.isSystem, true));
}

async function makeOrder() {
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
    // M5V is a seeded Toronto zone -> order lands "active", giving us a real orderId to attach rows to.
    contact: { fullName: "A B", phone: "+16475550111", addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6" },
  });
  const [o] = await db.select().from(orders).where(eq(orders.publicId, publicId));
  return o;
}

// Replaces whatever materializeDeliveries produced with 10 deterministic rows spanning two fixed
// weekdays-only weeks (2030-01-07..11, 2030-01-14..18), all scheduled and comfortably before cutoff.
async function activatedOrder() {
  const o = await makeOrder();
  await db.delete(deliveries).where(eq(deliveries.orderId, o.id));
  const dates = [
    "2030-01-07", "2030-01-08", "2030-01-09", "2030-01-10", "2030-01-11",
    "2030-01-14", "2030-01-15", "2030-01-16", "2030-01-17", "2030-01-18",
  ];
  await db.insert(deliveries).values(dates.map((deliveryDate) => ({
    orderId: o.id,
    deliveryDate,
    status: "scheduled" as const,
    cutoffAt: Date.now() + 1e9,
  })));
  return o;
}

async function rowsFor(o: { id: bigint }) {
  return db.select().from(deliveries).where(eq(deliveries.orderId, o.id)).orderBy(asc(deliveries.deliveryDate));
}

async function nthDelivery(o: { id: bigint }, n: number) {
  const rows = await rowsFor(o);
  return rows[n];
}

async function countRows(o: { id: bigint }) {
  return (await rowsFor(o)).length;
}

async function lockCutoff(o: { id: bigint }, n: number, cutoffAt: number) {
  const row = await nthDelivery(o, n);
  await db.update(deliveries).set({ cutoffAt }).where(eq(deliveries.id, row.id));
}

describe("pauseRange / resumeOrder (integration)", () => {
  beforeEach(reset);
  afterAll(reset);

  it("pauses only future scheduled originals; past-cutoff rows are excluded, not rejected", async () => {
    const o = await activatedOrder();
    await lockCutoff(o, 0, Date.now() - 1000); // row[0] (2030-01-07) past cutoff
    const n = await pauseRange(o.publicId, "2030-01-07", "2030-01-11");
    expect(n).toBe(4); // 5 in range, 1 already locked
    const rows = await rowsFor(o);
    expect(rows[0].status).toBe("scheduled"); // locked row untouched
    expect(rows.slice(1, 5).every((r) => r.status === "paused")).toBe(true);
    expect(rows.slice(5).every((r) => r.status === "scheduled")).toBe(true); // week 2 unaffected
  });

  it("a fully-past range is a no-op, not an error", async () => {
    const o = await activatedOrder();
    await db.update(deliveries).set({ cutoffAt: Date.now() - 1000 }).where(eq(deliveries.orderId, o.id));
    await expect(pauseRange(o.publicId, "2030-01-07", "2030-01-11")).resolves.toBe(0);
    const rows = await rowsFor(o);
    expect(rows.every((r) => r.status === "scheduled")).toBe(true);
  });

  it("a range matching no deliveries at all is a no-op, not an error", async () => {
    const o = await activatedOrder();
    await expect(pauseRange(o.publicId, "2031-01-01", "2031-01-05")).resolves.toBe(0);
    const rows = await rowsFor(o);
    expect(rows.every((r) => r.status === "scheduled")).toBe(true);
  });

  it("a make-up inside the range is ignored, not paused", async () => {
    // A fresh order with a gap in the window (no original on 2030-01-09) so a make-up can occupy
    // that date without colliding with the unique (orderId, deliveryDate) index.
    const o = await makeOrder();
    await db.delete(deliveries).where(eq(deliveries.orderId, o.id));
    const [src] = await db.insert(deliveries).values([
      { orderId: o.id, deliveryDate: "2030-01-07", status: "scheduled" as const, cutoffAt: Date.now() + 1e9 },
      { orderId: o.id, deliveryDate: "2030-01-08", status: "scheduled" as const, cutoffAt: Date.now() + 1e9 },
      { orderId: o.id, deliveryDate: "2030-01-11", status: "scheduled" as const, cutoffAt: Date.now() + 1e9 },
    ]).returning();
    const [mk] = await db.insert(deliveries).values({
      orderId: o.id,
      deliveryDate: "2030-01-09", // sits inside the pause window, on a date no original occupies
      status: "scheduled",
      cutoffAt: Date.now() + 1e9,
      makeupForDeliveryId: src.id,
    }).returning();
    const n = await pauseRange(o.publicId, "2030-01-07", "2030-01-11");
    // 3 originals in range (07, 08, 11); the make-up on 09 is ignored, not counted or paused.
    expect(n).toBe(3);
    const [mkRow] = await db.select().from(deliveries).where(eq(deliveries.id, mk.id));
    expect(mkRow.status).toBe("scheduled");
  });

  it("rejects malformed dates and inverted ranges", async () => {
    const o = await activatedOrder();
    await expect(pauseRange(o.publicId, "2030/01/07", "2030-01-11")).rejects.toBeInstanceOf(ValidationError);
    await expect(pauseRange(o.publicId, "2030-01-07", "2030-01-11T00:00")).rejects.toBeInstanceOf(ValidationError);
    await expect(pauseRange(o.publicId, "2030-01-11", "2030-01-07")).rejects.toBeInstanceOf(ValidationError);
  });

  it("resume reverts future paused rows, deletes nothing, ignores skipped", async () => {
    const o = await activatedOrder();
    await pauseRange(o.publicId, "2030-01-07", "2030-01-11"); // pauses week 1 (5 rows)
    await skipDelivery((await nthDelivery(o, 5)).publicId); // skip first row of week 2
    const before = await countRows(o);
    const n = await resumeOrder(o.publicId);
    expect(n).toBe(5);
    expect(await countRows(o)).toBe(before); // nothing deleted
    const rows = await rowsFor(o);
    expect(rows.slice(0, 5).every((r) => r.status === "scheduled")).toBe(true);
    expect(rows[5].status).toBe("skipped"); // untouched
  });

  it("resume does not touch a paused row already past its cutoff", async () => {
    const o = await activatedOrder();
    await pauseRange(o.publicId, "2030-01-07", "2030-01-11");
    // row[2] (2030-01-09) is paused; simulate its cutoff having since elapsed — a terminal miss
    // backed by a make-up, which resume must leave alone.
    const paused = await nthDelivery(o, 2);
    await db.update(deliveries).set({ cutoffAt: Date.now() - 1000 }).where(eq(deliveries.id, paused.id));
    const n = await resumeOrder(o.publicId);
    expect(n).toBe(4); // the other 4 paused rows revert
    const rows = await rowsFor(o);
    expect(rows[2].status).toBe("paused"); // left untouched
  });
});
