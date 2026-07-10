import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, ne } from "drizzle-orm";
import { nextWeekday, ValidationError } from "@realm/commons";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { deliveries, deliveryFrequencies, ledgerEntries, orderActivities, orders, payments, users } = await import("@/db/schema");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");
const { createOrder } = await import("../orders.service");
const { skipDelivery, unskipDelivery } = await import("../deliveries.service");

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

describe("skipDelivery / unskipDelivery (integration)", () => {
  beforeEach(reset);
  afterAll(reset);

  it("skips a future scheduled row", async () => {
    const d = await seedDelivery({ deliveryDate: "2030-01-07", cutoffAt: Date.now() + 1e9 });
    await skipDelivery(d.publicId);
    const [row] = await db.select().from(deliveries).where(eq(deliveries.id, d.id));
    expect(row.status).toBe("skipped");
  });

  it("rejects a skip once the row's cutoff has passed", async () => {
    const d = await seedDelivery({ deliveryDate: "2030-01-07", cutoffAt: Date.now() - 1000 });
    await expect(skipDelivery(d.publicId)).rejects.toBeInstanceOf(ValidationError);
    const [row] = await db.select().from(deliveries).where(eq(deliveries.id, d.id));
    expect(row.status).toBe("scheduled");
  });

  it("rejects skipping a make-up row", async () => {
    const src = await seedDelivery({ deliveryDate: "2030-01-07", cutoffAt: 1 });
    const mk = await seedDelivery({
      deliveryDate: "2030-01-14",
      cutoffAt: Date.now() + 1e9,
      makeupForDeliveryId: src.id,
      orderId: src.orderId,
    });
    await expect(skipDelivery(mk.publicId)).rejects.toBeInstanceOf(ValidationError);
    const [row] = await db.select().from(deliveries).where(eq(deliveries.id, mk.id));
    expect(row.status).toBe("scheduled");
  });

  it("rejects skipping an already-skipped row", async () => {
    const d = await seedDelivery({ deliveryDate: "2030-01-07", cutoffAt: Date.now() + 1e9, status: "skipped" });
    await expect(skipDelivery(d.publicId)).rejects.toBeInstanceOf(ValidationError);
    const [row] = await db.select().from(deliveries).where(eq(deliveries.id, d.id));
    expect(row.status).toBe("skipped");
  });

  it("rejects re-skipping a row already skipped by a prior call (guard evaluated post-lock)", async () => {
    const d = await seedDelivery({ deliveryDate: "2030-01-07", cutoffAt: Date.now() + 1e9 });
    await skipDelivery(d.publicId);
    await expect(skipDelivery(d.publicId)).rejects.toBeInstanceOf(ValidationError);
    const [row] = await db.select().from(deliveries).where(eq(deliveries.id, d.id));
    expect(row.status).toBe("skipped");
  });

  it("unskip restores scheduled before cutoff", async () => {
    const d = await seedDelivery({ deliveryDate: "2030-01-07", cutoffAt: Date.now() + 1e9, status: "skipped" });
    await unskipDelivery(d.publicId);
    const [row] = await db.select().from(deliveries).where(eq(deliveries.id, d.id));
    expect(row.status).toBe("scheduled");
  });

  it("rejects unskip once the row's cutoff has passed", async () => {
    const d = await seedDelivery({ deliveryDate: "2030-01-07", cutoffAt: Date.now() - 1000, status: "skipped" });
    await expect(unskipDelivery(d.publicId)).rejects.toBeInstanceOf(ValidationError);
    const [row] = await db.select().from(deliveries).where(eq(deliveries.id, d.id));
    expect(row.status).toBe("skipped");
  });

  it("refuses to unskip once a make-up exists", async () => {
    const src = await seedDelivery({ deliveryDate: "2030-01-07", cutoffAt: Date.now() + 1e9, status: "skipped" });
    await seedDelivery({
      deliveryDate: "2030-01-14",
      cutoffAt: 1,
      makeupForDeliveryId: src.id,
      orderId: src.orderId,
    });
    await expect(unskipDelivery(src.publicId)).rejects.toBeInstanceOf(ValidationError);
    const [row] = await db.select().from(deliveries).where(eq(deliveries.id, src.id));
    expect(row.status).toBe("skipped");
  });
});
