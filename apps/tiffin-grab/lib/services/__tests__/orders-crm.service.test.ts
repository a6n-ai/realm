import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ne } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { orders, payments, orderActivities, ledgerEntries, users } = await import("@/db/schema");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");
const { nextWeekday } = await import("@realm/commons");
const { createOrder } = await import("../orders.service");
const { listOrders, readOrder } = await import("../orders.service");

async function reset() {
  await db.delete(ledgerEntries);
  await db.delete(orderActivities);
  await db.delete(payments);
  await db.delete(orders);
  await db.delete(users).where(ne(users.isSystem, true));
}

const baseInput = (mealSizePublicId: string, planKey: string, fullName = "Jane Customer", phone = "+16475550111") => ({
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
  contact: { fullName, phone, addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6" },
});

describe("order CRM queries (integration)", () => {
  beforeEach(reset);
  afterAll(reset);

  it("listOrders returns rows and filters by search + status", async () => {
    const snap = await loadCatalogSnapshot();
    await createOrder(baseInput(snap.mealSizes[0].publicId, snap.plans[0].key, "Jane Customer", "+16475550111"));
    await createOrder(baseInput(snap.mealSizes[0].publicId, snap.plans[0].key, "Bob Buyer", "+16475550222"));

    const all = await listOrders();
    expect(all.length).toBe(2);

    const byName = await listOrders({ search: "jane" });
    expect(byName.map((r) => r.fullName)).toEqual(["Jane Customer"]);

    // createOrder sets status to "active" or "waitlisted" based on zone matching;
    // filtering by the actual status should return all 2 rows, "pending" should return 0.
    const actualStatus = all[0].status;
    const byStatus = await listOrders({ status: actualStatus });
    expect(byStatus.length).toBe(2);
    const pending = await listOrders({ status: "pending" });
    expect(pending.length).toBe(0);
  });

  it("readOrder returns detail with plan/payment info", async () => {
    const snap = await loadCatalogSnapshot();
    const { publicId } = await createOrder(baseInput(snap.mealSizes[0].publicId, snap.plans[0].key));
    const detail = await readOrder(publicId);
    expect(detail.publicId).toBe(publicId);
    expect(detail.planName).toBeTruthy();
    expect(detail.payments.length).toBeGreaterThan(0);
  });
});
