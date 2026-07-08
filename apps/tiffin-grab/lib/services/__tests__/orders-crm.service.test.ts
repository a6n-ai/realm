import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ne } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { orders, payments, orderActivities, ledgerEntries, users } = await import("@/db/schema");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");
const { nextWeekday } = await import("@realm/commons");
const { createOrder } = await import("../orders.service");
const { listOrders, listOrdersPage, readOrder } = await import("../orders.service");
const { eq: cEq } = await import("@realm/commons/model/condition");

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

  it("listOrdersPage filters by Condition and paginates with a total", async () => {
    const snap = await loadCatalogSnapshot();
    await createOrder(baseInput(snap.mealSizes[0].publicId, snap.plans[0].key, "Jane Customer", "+16475550111"));
    await createOrder(baseInput(snap.mealSizes[0].publicId, snap.plans[0].key, "Bob Buyer", "+16475550222"));

    // Page slice: 2 rows, size 1 -> first page has 1 item but total reflects all matches.
    const firstPage = await listOrdersPage(undefined, { page: 0, size: 1 });
    expect(firstPage.items.length).toBe(1);
    expect(firstPage.total).toBe(2);
    expect(firstPage.size).toBe(1);

    const secondPage = await listOrdersPage(undefined, { page: 1, size: 1 });
    expect(secondPage.items.length).toBe(1);
    expect(secondPage.items[0].publicId).not.toBe(firstPage.items[0].publicId);

    // Condition filter: no order is "pending" after createOrder, so total is 0.
    const pending = await listOrdersPage(cEq("status", "pending"), { page: 0, size: 10 });
    expect(pending.total).toBe(0);
    expect(pending.items.length).toBe(0);
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
