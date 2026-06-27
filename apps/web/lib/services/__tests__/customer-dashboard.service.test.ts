import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, ne } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { users, orders, payments, orderActivities, ledgerEntries } = await import("@/db/schema");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");
const { nextWeekday } = await import("@tiffin/commons");
const { createOrder } = await import("../orders.service");
const { getCustomerDashboard } = await import("../customers.service");

async function reset() {
  await db.delete(ledgerEntries);
  await db.delete(orderActivities);
  await db.delete(payments);
  await db.delete(orders);
  await db.delete(users).where(ne(users.isSystem, true));
}

const PHONE = "+16475550444";

const baseInput = (mealSizePublicId: string, planKey: string) => ({
  planKey,
  selections: {
    mealSizeId: mealSizePublicId,
    frequencyKey: "5_day" as const,
    persons: 1,
    mealSlots: ["lunch"],
    includeSaturday: false,
    includeSunday: false,
    durationWeeks: 1,
    startDate: nextWeekday(new Date()).toISOString().slice(0, 10),
  },
  contact: { fullName: "Dash Customer", phone: PHONE, addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6" },
});

describe("getCustomerDashboard (integration)", () => {
  beforeEach(reset);
  afterAll(reset);

  it("aggregates orders, current subscription, and lifetime spend for the signed-in customer", async () => {
    const snap = await loadCatalogSnapshot();
    await createOrder(baseInput(snap.mealSizes[0].publicId, snap.plans[0].key));

    const [u] = await db.select({ publicId: users.publicId }).from(users).where(eq(users.phone, PHONE)).limit(1);
    const data = await getCustomerDashboard(u.publicId);

    expect(data.profile.name).toBe("Dash Customer");
    expect(data.ordersCount).toBe(1);
    expect(data.orders[0].planName).toBeTruthy();
    expect(data.orders[0].mealSizeName).toBeTruthy();
    // createOrder records a simulated payment → ledger credit, so spend is the order total.
    expect(Number(data.totalSpent)).toBeCloseTo(Number(data.orders[0].total), 2);
    expect(data.current).not.toBeNull();
    expect(data.current!.publicId).toBe(data.orders[0].publicId);
    // No bigint id leaks to the projected shape.
    expect(data.current).not.toHaveProperty("userId");
    expect(data.current).not.toHaveProperty("id");
  });

  it("returns an empty, zero-spend shape for a customer with no orders", async () => {
    const [u] = await db
      .insert(users)
      .values({ email: "noorders@example.com", phone: "+16475550555", name: "No Orders", role: "user" })
      .returning({ publicId: users.publicId });

    const data = await getCustomerDashboard(u.publicId);
    expect(data.ordersCount).toBe(0);
    expect(data.orders).toEqual([]);
    expect(data.current).toBeNull();
    expect(data.totalSpent).toBe("0.00");
  });
});
