import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, ne } from "drizzle-orm";
import { cutoffMsFor, nextWeekday } from "@realm/commons";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { auditLog, deliveries, ledgerEntries, orderActivities, orders, payments, users } = await import("@/db/schema");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");
const { createOrder } = await import("../orders.service");
const { getAppSettings, setAppSettings } = await import("../app-settings.service");

async function reset() {
  await db.delete(deliveries);
  await db.delete(ledgerEntries);
  await db.delete(orderActivities);
  await db.delete(payments);
  await db.delete(orders);
  await db.delete(users).where(ne(users.isSystem, true));
  await db.delete(auditLog).where(eq(auditLog.entity, "app"));
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

// Replaces whatever materializeDeliveries produced with 10 deterministic rows, all scheduled and
// comfortably before cutoff, matching the fixture used by deliveries-pause.test.ts.
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

describe("setAppSettings recomputes cutoff_at (integration)", () => {
  beforeEach(reset);
  afterAll(reset);

  it("recomputes cutoff_at for not-yet-missed rows and freezes missed ones", async () => {
    const original = await getAppSettings();
    try {
      const o = await activatedOrder();
      const rows = await db.select().from(deliveries).where(eq(deliveries.orderId, o.id));
      const missed = rows[0];
      const frozen = Date.now() - 1000;
      await db.update(deliveries).set({ cutoffAt: frozen }).where(eq(deliveries.id, missed.id));

      await setAppSettings({ timezone: "America/Toronto", cutoffHour: 10 });

      const [after] = await db.select().from(deliveries).where(eq(deliveries.id, missed.id));
      expect(after.cutoffAt).toBe(frozen); // missed rows never move
      const [future] = await db.select().from(deliveries).where(eq(deliveries.id, rows[1].id));
      expect(future.cutoffAt).toBe(cutoffMsFor(rows[1].deliveryDate, 10, "America/Toronto"));
    } finally {
      await setAppSettings(original);
    }
  });

  it("recomputes cutoff_at using the new timezone, not the old one", async () => {
    const original = await getAppSettings();
    try {
      const o = await activatedOrder();
      const rows = await db.select().from(deliveries).where(eq(deliveries.orderId, o.id));

      // America/Vancouver has a different UTC offset than the America/Toronto default/schema
      // default, so this fails if patch.timezone is ever swapped for a hardcoded "America/Toronto".
      await setAppSettings({ timezone: "America/Vancouver", cutoffHour: 9 });

      for (const row of rows) {
        const [after] = await db.select().from(deliveries).where(eq(deliveries.id, row.id));
        expect(after.cutoffAt).toBe(cutoffMsFor(row.deliveryDate, 9, "America/Vancouver"));
      }
    } finally {
      await setAppSettings(original);
    }
  });

  it("does not resurrect a row whose cutoff lapsed mid-loop (simulated race)", async () => {
    const original = await getAppSettings();
    try {
      const o = await activatedOrder();
      const rows = await db.select().from(deliveries).where(eq(deliveries.orderId, o.id));
      const target = rows[0];

      // Row is selected as "future" by setAppSettings's SELECT (cutoffAt is Date.now() + 1e9 from
      // activatedOrder), but we lapse it here to simulate reconcileMakeups marking it missed
      // concurrently, between the SELECT and the per-row UPDATE.
      const lapsed = Date.now() - 1000;
      await db.update(deliveries).set({ cutoffAt: lapsed }).where(eq(deliveries.id, target.id));

      await setAppSettings({ timezone: "America/Toronto", cutoffHour: 11 });

      const [after] = await db.select().from(deliveries).where(eq(deliveries.id, target.id));
      expect(after.cutoffAt).toBe(lapsed); // guarded UPDATE must skip the now-lapsed row
    } finally {
      await setAppSettings(original);
    }
  });
});
