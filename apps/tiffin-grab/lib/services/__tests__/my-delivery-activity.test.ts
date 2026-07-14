import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, ne } from "drizzle-orm";
import { nextWeekday } from "@realm/commons";

const session: { user: { id: string; role: string } | null } = { user: null };
vi.mock("@/lib/auth/session", () => ({ getSession: async () => (session.user ? session : null) }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const { db } = await import("@/db/client");
const { deliveries, ledgerEntries, orderActivities, orders, payments, users } = await import("@/db/schema");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");
const { createOrder } = await import("@/lib/services/orders.service");
const { myDeliveryActivity } = await import("../customer-deliveries.service");
const { skipMyDelivery } = await import("@/app/(customer)/me/deliveries/actions");

function actAs(publicId: string) {
  session.user = { id: publicId, role: "user" };
}

async function reset() {
  await db.delete(deliveries);
  await db.delete(ledgerEntries);
  await db.delete(orderActivities);
  await db.delete(payments);
  await db.delete(orders);
  await db.delete(users).where(ne(users.isSystem, true));
}

// M5V is a seeded Toronto zone -> lands "active" with materialized rows.
async function makeOrder(phone: string, fullName: string) {
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
    contact: { fullName, phone, addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6" },
  });
  const [o] = await db.select().from(orders).where(eq(orders.publicId, publicId));
  return o;
}

async function userIdOf(order: { id: bigint }) {
  const [u] = await db
    .select({ id: users.id, publicId: users.publicId })
    .from(orders)
    .innerJoin(users, eq(orders.userId, users.id))
    .where(eq(orders.id, order.id));
  return u;
}

const PHONE_A = "+16475550531";
const PHONE_B = "+16475550532";

describe("myDeliveryActivity (integration)", () => {
  beforeEach(async () => {
    await reset();
    session.user = null;
  });
  afterAll(reset);

  it("returns only the caller's own activity, newest first", async () => {
    const aOrder = await makeOrder(PHONE_A, "User A");
    const a = await userIdOf(aOrder);
    const bOrder = await makeOrder(PHONE_B, "User B");
    const b = await userIdOf(bOrder);
    const [ad] = await db.select().from(deliveries).where(eq(deliveries.orderId, aOrder.id));
    const [bd] = await db.select().from(deliveries).where(eq(deliveries.orderId, bOrder.id));

    actAs(a.publicId);
    await skipMyDelivery(ad.publicId);
    actAs(b.publicId);
    await skipMyDelivery(bd.publicId);

    const aActivity = await myDeliveryActivity(a.id);
    expect(aActivity.length).toBeGreaterThan(0);
    expect(aActivity.every((r) => r.orderPublicId === aOrder.publicId)).toBe(true);

    // newest first
    const createdAts = aActivity.map((r) => r.createdAt);
    expect(createdAts).toEqual([...createdAts].sort((x, y) => y - x));
  });

  it("respects the limit parameter", async () => {
    const aOrder = await makeOrder(PHONE_A, "User A");
    const a = await userIdOf(aOrder);
    const [ad] = await db.select().from(deliveries).where(eq(deliveries.orderId, aOrder.id));

    actAs(a.publicId);
    await skipMyDelivery(ad.publicId);

    const limited = await myDeliveryActivity(a.id, 1);
    expect(limited.length).toBe(1);
  });
});
