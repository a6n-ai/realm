import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, ne } from "drizzle-orm";
import { nextWeekday, ValidationError } from "@realm/commons";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { deliveries, ledgerEntries, orderActivities, orders, payments, users } = await import("@/db/schema");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");
const { createOrder } = await import("../orders.service");
const { setDeliveryAddress, clearDeliveryAddress, effectiveAddress } = await import("../deliveries.service");

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

async function seedDelivery(opts: {
  deliveryDate: string;
  cutoffAt: number;
  status?: "scheduled" | "paused" | "skipped" | "cancelled";
  makeupForDeliveryId?: bigint;
  orderId?: bigint;
}) {
  const orderId = opts.orderId ?? (await makeOrder()).id;
  const [row] = await db.insert(deliveries).values({
    orderId,
    deliveryDate: opts.deliveryDate,
    status: opts.status ?? "scheduled",
    cutoffAt: opts.cutoffAt,
    makeupForDeliveryId: opts.makeupForDeliveryId ?? null,
  }).returning();
  return row;
}

describe("setDeliveryAddress / clearDeliveryAddress / effectiveAddress (integration)", () => {
  beforeEach(reset);
  afterAll(reset);

  it("effectiveAddress inherits the order's address when all four columns are NULL", async () => {
    const order = await makeOrder();
    const d = await seedDelivery({ deliveryDate: "2030-01-07", cutoffAt: Date.now() + 1e9, orderId: order.id });
    const eff = effectiveAddress(d, order);
    expect(eff).toEqual({
      fullName: order.fullName,
      addressLine: order.addressLine,
      city: order.city,
      postalCode: order.postalCode,
      zoneId: order.zoneId,
    });
  });

  it("setDeliveryAddress snapshots the four fields and re-resolves zoneId from the postal prefix", async () => {
    const order = await makeOrder();
    const d = await seedDelivery({ deliveryDate: "2030-01-07", cutoffAt: Date.now() + 1e9, orderId: order.id });
    await setDeliveryAddress(d.publicId, {
      fullName: "New Name",
      addressLine: "2 Other St",
      city: "Toronto",
      postalCode: "M4C 1A1",
    });
    const [row] = await db.select().from(deliveries).where(eq(deliveries.id, d.id));
    expect(row.fullName).toBe("New Name");
    expect(row.addressLine).toBe("2 Other St");
    expect(row.city).toBe("Toronto");
    expect(row.postalCode).toBe("M4C 1A1");
    expect(row.zoneId).not.toBeNull();

    const eff = effectiveAddress(row, order);
    expect(eff).toEqual({
      fullName: "New Name",
      addressLine: "2 Other St",
      city: "Toronto",
      postalCode: "M4C 1A1",
      zoneId: row.zoneId,
    });
  });

  it("rejects a postal code matching no zone and leaves the row unchanged", async () => {
    const order = await makeOrder();
    const d = await seedDelivery({ deliveryDate: "2030-01-07", cutoffAt: Date.now() + 1e9, orderId: order.id });
    await expect(
      setDeliveryAddress(d.publicId, {
        fullName: "New Name",
        addressLine: "2 Other St",
        city: "Ottawa",
        postalCode: "K1A 0A1",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    const [row] = await db.select().from(deliveries).where(eq(deliveries.id, d.id));
    expect(row.fullName).toBeNull();
    expect(row.addressLine).toBeNull();
    expect(row.city).toBeNull();
    expect(row.postalCode).toBeNull();
    expect(row.zoneId).toBeNull();
  });

  it("rejects a re-address once the row's cutoff has passed", async () => {
    const order = await makeOrder();
    const d = await seedDelivery({ deliveryDate: "2030-01-07", cutoffAt: Date.now() - 1000, orderId: order.id });
    await expect(
      setDeliveryAddress(d.publicId, {
        fullName: "New Name",
        addressLine: "2 Other St",
        city: "Toronto",
        postalCode: "M4C 1A1",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    const [row] = await db.select().from(deliveries).where(eq(deliveries.id, d.id));
    expect(row.fullName).toBeNull();
  });

  it("allows re-addressing a make-up row (unlike skip/pause)", async () => {
    const src = await seedDelivery({ deliveryDate: "2030-01-07", cutoffAt: 1 });
    const mk = await seedDelivery({
      deliveryDate: "2030-01-14",
      cutoffAt: Date.now() + 1e9,
      makeupForDeliveryId: src.id,
      orderId: src.orderId,
    });
    await setDeliveryAddress(mk.publicId, {
      fullName: "Makeup Name",
      addressLine: "3 Third St",
      city: "Toronto",
      postalCode: "M4C 1A1",
    });
    const [row] = await db.select().from(deliveries).where(eq(deliveries.id, mk.id));
    expect(row.fullName).toBe("Makeup Name");
    expect(row.zoneId).not.toBeNull();
  });

  it("clearDeliveryAddress restores inheritance", async () => {
    const order = await makeOrder();
    const d = await seedDelivery({ deliveryDate: "2030-01-07", cutoffAt: Date.now() + 1e9, orderId: order.id });
    await setDeliveryAddress(d.publicId, {
      fullName: "New Name",
      addressLine: "2 Other St",
      city: "Toronto",
      postalCode: "M4C 1A1",
    });
    await clearDeliveryAddress(d.publicId);
    const [row] = await db.select().from(deliveries).where(eq(deliveries.id, d.id));
    expect(row.fullName).toBeNull();
    expect(row.addressLine).toBeNull();
    expect(row.city).toBeNull();
    expect(row.postalCode).toBeNull();
    expect(row.zoneId).toBeNull();
    const eff = effectiveAddress(row, order);
    expect(eff).toEqual({
      fullName: order.fullName,
      addressLine: order.addressLine,
      city: order.city,
      postalCode: order.postalCode,
      zoneId: order.zoneId,
    });
  });
});
