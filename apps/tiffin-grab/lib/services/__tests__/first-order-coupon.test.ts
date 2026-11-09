import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { deleteNonSystemUsers } = await import("@/db/test-helpers");
const { coupons, couponRedemptions, ledgerEntries, orders, payments, users } = await import("@/db/schema");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");
const { couponsService } = await import("../coupons.service");

async function reset() {
  await db.delete(ledgerEntries);
  await db.delete(couponRedemptions);
  await db.delete(coupons);
  await db.delete(payments);
  await db.delete(orders);
  await deleteNonSystemUsers();
}

let n = 0;
async function customerWithOrder(pay: "paid" | "awaiting_payment" | null) {
  const snap = await loadCatalogSnapshot();
  const [u] = await db.insert(users).values({ email: `fo${n}@test.invalid`, role: "user", name: "FO" }).returning({ id: users.id });
  const [o] = await db
    .insert(orders)
    .values({ userId: u.id, planId: snap.plans[0].id, mealSizeId: snap.mealSizes[0].id, frequencyId: snap.frequencies[0].id, persons: 1, durationWeeks: 1, startDate: "2030-01-06", tiffinCount: 5, perTiffinPrice: "10.00", pricingSnapshot: {}, total: "50.00", status: "active", deploymentId: `FO-${n++}`, fullName: "T", addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6" })
    .returning({ id: orders.id });
  if (pay) await db.insert(payments).values({ orderId: o.id, status: pay, method: "stripe", amount: "50.00" });
  return u.id;
}

describe("first_order coupon: new customer = no paid order yet", () => {
  beforeEach(async () => {
    await reset();
    await db.insert(coupons).values({ code: "WELCOME10", kind: "first_order", name: "Welcome", valueAmount: "10", config: { kind: "first_order", mode: "fixed" }, active: true, visible: true });
  });
  afterAll(reset);

  it("still offered to a customer with only an unpaid order", async () => {
    const id = await customerWithOrder("awaiting_payment");
    expect((await couponsService.listAvailable(id)).map((c) => c.code)).toContain("WELCOME10");
  });

  it("still offered to a customer with an order but no payment row", async () => {
    const id = await customerWithOrder(null);
    expect((await couponsService.listAvailable(id)).map((c) => c.code)).toContain("WELCOME10");
  });

  it("not offered once they have paid", async () => {
    const id = await customerWithOrder("paid");
    expect((await couponsService.listAvailable(id)).map((c) => c.code)).not.toContain("WELCOME10");
  });
});
