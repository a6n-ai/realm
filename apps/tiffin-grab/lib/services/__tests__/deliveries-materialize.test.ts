import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, ne } from "drizzle-orm";
import { cutoffMsFor, nextWeekday, ValidationError } from "@realm/commons";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { deliveries, deliveryFrequencies, ledgerEntries, orderActivities, orders, payments, users } = await import("@/db/schema");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");
const { getAppSettings } = await import("../app-settings.service");
const { materializeDeliveries } = await import("../deliveries.service");
const { activateOrder, createOrder } = await import("../orders.service");

async function reset() {
  await db.delete(deliveries);
  await db.delete(ledgerEntries);
  await db.delete(orderActivities);
  await db.delete(payments);
  await db.delete(orders);
  await db.delete(users).where(ne(users.isSystem, true));
  await db.update(deliveryFrequencies).set({ daysPerWeek: 5 }).where(eq(deliveryFrequencies.key, "5_day"));
}

async function makeOrder(opts: {
  durationWeeks: number;
  persons: number;
  frequencyKey: string;
  includeSaturday?: boolean;
  includeSunday?: boolean;
}) {
  const snap = await loadCatalogSnapshot();
  const { publicId } = await createOrder({
    planKey: snap.plans[0].key,
    selections: {
      mealSizeId: snap.mealSizes[0].publicId,
      frequencyKey: opts.frequencyKey as "5_day" | "mwf",
      persons: opts.persons,
      mealSlots: ["lunch"],
      includeSaturday: opts.includeSaturday ?? false,
      includeSunday: opts.includeSunday ?? false,
      durationWeeks: opts.durationWeeks,
      startDate: nextWeekday(new Date()).toISOString().slice(0, 10),
    },
    // M5V is a seeded Toronto zone (zon_toronto: M4/M5/M6) — this order lands "active".
    contact: { fullName: "A B", phone: "+16475550111", addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6" },
  });
  const [o] = await db.select().from(orders).where(eq(orders.publicId, publicId));
  return o;
}

// K1A (Ottawa) matches no seeded zone (only M*/L* prefixes are seeded), so
// createOrder's zoneRow is null and the order lands genuinely "waitlisted"
// with zero delivery rows — the precondition activate() is meant to handle.
async function makeWaitlistedOrder(opts: { durationWeeks: number; persons: number; frequencyKey: string }) {
  const snap = await loadCatalogSnapshot();
  const { publicId } = await createOrder({
    planKey: snap.plans[0].key,
    selections: {
      mealSizeId: snap.mealSizes[0].publicId,
      frequencyKey: opts.frequencyKey as "5_day" | "mwf",
      persons: opts.persons,
      mealSlots: ["lunch"],
      includeSaturday: false,
      includeSunday: false,
      durationWeeks: opts.durationWeeks,
      startDate: nextWeekday(new Date()).toISOString().slice(0, 10),
    },
    contact: { fullName: "Wait List", phone: "+16475550112", addressLine: "1 Rideau St", city: "Ottawa", postalCode: "K1A 0A1" },
  });
  const [o] = await db.select().from(orders).where(eq(orders.publicId, publicId));
  return o;
}

describe("materializeDeliveries (integration)", () => {
  beforeEach(reset);
  afterAll(reset);

  it("creates exactly N rows where N = durationWeeks * deliveryDays.length", async () => {
    const o = await makeOrder({ durationWeeks: 2, persons: 1, frequencyKey: "5_day" });
    // createOrder already materializes for a zone-matched (active) order — clear it
    // so this test proves materializeDeliveries' own row count, not createOrder's hook.
    await db.delete(deliveries).where(eq(deliveries.orderId, o.id));
    const n = await db.transaction((tx) => materializeDeliveries(tx, o));
    expect(n).toBe(10);
    const rows = await db.select().from(deliveries).where(eq(deliveries.orderId, o.id));
    expect(rows.length).toBe(10);
    expect(rows.every((r) => r.status === "scheduled" && r.makeupForDeliveryId === null)).toBe(true);
  });

  it("N is drops, not tiffins: persons does not multiply rows", async () => {
    const o = await makeOrder({ durationWeeks: 2, persons: 3, frequencyKey: "5_day" });
    await db.delete(deliveries).where(eq(deliveries.orderId, o.id));
    const n = await db.transaction((tx) => materializeDeliveries(tx, o));
    expect(n).toBe(10); // drops
    expect(n * o.persons).toBe(o.tiffinCount); // 30 tiffins
  });

  it("is idempotent", async () => {
    const o = await makeOrder({ durationWeeks: 1, persons: 1, frequencyKey: "5_day" });
    // Order is already materialized by createOrder's hook (zone-matched) — a
    // second call must be a no-op.
    const again = await db.transaction((tx) => materializeDeliveries(tx, o));
    expect(again).toBe(0);
    const rows = await db.select().from(deliveries).where(eq(deliveries.orderId, o.id));
    expect(rows.length).toBe(5);
  });

  it("snapshots cutoff_at as the day-before cutoff in the app timezone", async () => {
    const { timezone, cutoffHour } = await getAppSettings();
    const o = await makeOrder({ durationWeeks: 1, persons: 1, frequencyKey: "5_day" });
    const rows = await db.select().from(deliveries).where(eq(deliveries.orderId, o.id));
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.cutoffAt).toBe(cutoffMsFor(r.deliveryDate, cutoffHour, timezone));
  });

  it("throws when the frequency's daysPerWeek disagrees with orderDeliveryDays()", async () => {
    // Create the order while daysPerWeek is still consistent (5), then tamper it
    // to 4 after the fact — createOrder's own in-tx materialization must not be
    // the thing under test here, only the direct call below.
    const o = await makeOrder({ durationWeeks: 1, persons: 1, frequencyKey: "5_day" });
    await db.delete(deliveries).where(eq(deliveries.orderId, o.id));
    await db.update(deliveryFrequencies).set({ daysPerWeek: 4 })
      .where(eq(deliveryFrequencies.key, "5_day"));
    await expect(db.transaction((tx) => materializeDeliveries(tx, o))).rejects.toBeInstanceOf(ValidationError);
  });

  it("does not throw for a 5-day frequency with includeSaturday: weekend days are excluded from the daysPerWeek check", async () => {
    // WEEKEND exclusion: base 5 weekdays + sat = 6 days/week, but baseDays
    // (weekdays only) is still 5, matching the "5_day" frequency's daysPerWeek.
    const o = await makeOrder({ durationWeeks: 1, persons: 1, frequencyKey: "5_day", includeSaturday: true });
    const rows = await db.select().from(deliveries).where(eq(deliveries.orderId, o.id));
    expect(rows.length).toBe(6); // 1 week * 6 days (mon-fri + sat)
  });
});

describe("activate() wiring (integration)", () => {
  beforeEach(reset);
  afterAll(reset);

  it("materializes deliveries through the real activate() service call, not just materializeDeliveries directly", async () => {
    const o = await makeWaitlistedOrder({ durationWeeks: 2, persons: 1, frequencyKey: "5_day" });
    expect(o.status).toBe("waitlisted");
    const zero = await db.select().from(deliveries).where(eq(deliveries.orderId, o.id));
    expect(zero.length).toBe(0);

    await activateOrder(o.publicId);

    const { timezone, cutoffHour } = await getAppSettings();
    const rows = await db.select().from(deliveries).where(eq(deliveries.orderId, o.id));
    expect(rows.length).toBe(10); // 2 weeks * 5 days
    expect(rows.every((r) => r.status === "scheduled" && r.makeupForDeliveryId === null)).toBe(true);
    for (const r of rows) expect(r.cutoffAt).toBe(cutoffMsFor(r.deliveryDate, cutoffHour, timezone));

    // Second activate() must hit the waitlisted-only guard and leave the rows untouched.
    await expect(activateOrder(o.publicId)).rejects.toBeInstanceOf(ValidationError);
    const rowsAfter = await db.select().from(deliveries).where(eq(deliveries.orderId, o.id));
    expect(rowsAfter.length).toBe(10);
  });

  it("is atomic: a materialization failure rolls back the status flip (order stays waitlisted, zero deliveries)", async () => {
    const o = await makeWaitlistedOrder({ durationWeeks: 1, persons: 1, frequencyKey: "5_day" });
    // Force materializeDeliveries' daysPerWeek assertion to throw inside activate()'s tx.
    await db.update(deliveryFrequencies).set({ daysPerWeek: 4 }).where(eq(deliveryFrequencies.key, "5_day"));

    await expect(activateOrder(o.publicId)).rejects.toBeInstanceOf(ValidationError);

    const [after] = await db.select().from(orders).where(eq(orders.id, o.id));
    expect(after.status).toBe("waitlisted");
    const rows = await db.select().from(deliveries).where(eq(deliveries.orderId, o.id));
    expect(rows.length).toBe(0);
  });
});
