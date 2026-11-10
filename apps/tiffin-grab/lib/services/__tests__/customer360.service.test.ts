import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { deleteNonSystemUsers } = await import("@/db/test-helpers");
const { users, inquiries, leadSources, orders, payments, orderActivities, inquiryActivities, walletLedger, deliveries, plans, mealSizes, deliveryFrequencies } = await import("@/db/schema");
const { awardCustomerBroadcast } = await import("../customer-payouts.service");
const { getCustomer360 } = await import("../customers.service");

async function reset() {
  await db.delete(walletLedger);
  await db.delete(orderActivities);
  await db.delete(inquiryActivities);
  await db.delete(payments);
  await db.delete(orders);
  await db.delete(inquiries);
  await deleteNonSystemUsers();
}

describe("getCustomer360 (integration)", () => {
  beforeEach(reset);
  afterAll(reset);

  it("matches inquiries by case-insensitive email/phone", async () => {
    const [u] = await db.insert(users).values({
      email: "match@example.com", phone: "+16475559999", role: "user",
    }).returning({ publicId: users.publicId });
    const [manual] = await db.select({ id: leadSources.id }).from(leadSources).where(eq(leadSources.key, "manual")).limit(1);
    await db.insert(inquiries).values({ fullName: "Match Person", phone: "+16475559999", email: "OTHER@x.com", sourceId: manual.id, stage: "new" });
    await db.insert(inquiries).values({ fullName: "Email Match", phone: "+10000000000", email: "MATCH@example.com", sourceId: manual.id, stage: "new" });
    await db.insert(inquiries).values({ fullName: "No Match", phone: "+19999999999", email: "no@x.com", sourceId: manual.id, stage: "new" });

    const result = await getCustomer360(u.publicId);
    expect(result.profile.email).toBe("match@example.com");
    const names = result.inquiries.map((i) => i.fullName).sort();
    expect(names).toEqual(["Email Match", "Match Person"]);
  });

  it("shows Give coins grants in the timeline with who gave them", async () => {
    const [u] = await db.insert(users).values({ email: "coins@example.com", role: "user" }).returning({ id: users.id, publicId: users.publicId });
    const [staff] = await db.insert(users).values({ email: "staff@example.com", name: "Priya Staff", role: "admin" }).returning({ id: users.id });
    await awardCustomerBroadcast([u.id], 40, "Diwali thank-you", staff.id);

    const { timeline } = await getCustomer360(u.publicId);
    const wallet = timeline.filter((e) => e.kind === "wallet");
    expect(wallet.map((e) => e.label)).toEqual(['+40 coins · Staff grant · "Diwali thank-you" · by Priya Staff']);
  });

  it("sums paid, outstanding and refunded, and dates the last confirmed delivery", async () => {
    const [u] = await db.insert(users).values({ email: "money@example.com", role: "user" }).returning({ id: users.id, publicId: users.publicId });
    const [plan] = await db.select({ id: plans.id }).from(plans).limit(1);
    const [size] = await db.select({ id: mealSizes.id }).from(mealSizes).limit(1);
    const [freq] = await db.select({ id: deliveryFrequencies.id }).from(deliveryFrequencies).limit(1);
    const [o] = await db.insert(orders).values({
      userId: u.id, planId: plan!.id, mealSizeId: size!.id, frequencyId: freq!.id, durationWeeks: 1,
      startDate: "2035-01-01", tiffinCount: 5, perTiffinPrice: "10.00", pricingSnapshot: {}, total: "50.00",
      deploymentId: `C360-${Date.now()}`, fullName: "Money", addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6", status: "active",
    }).returning({ id: orders.id });
    await db.insert(payments).values([
      { orderId: o.id, amount: "50.00", method: "etransfer", status: "paid", capturedAt: 1_000 },
      { orderId: o.id, amount: "20.00", method: "etransfer", status: "awaiting_payment" },
      { orderId: o.id, amount: "15.00", method: "stripe", status: "refunded" },
    ]);
    const dlv = { orderId: o.id, cutoffAt: 0, tiffinUnits: 1 };
    await db.insert(deliveries).values([
      { ...dlv, deliveryDate: "2035-01-02", status: "scheduled", optimoCompletionStatus: "success" },
      // Later but unconfirmed, or confirmed then skipped: neither is a delivered tiffin.
      { ...dlv, deliveryDate: "2035-01-03", status: "scheduled" },
      { ...dlv, deliveryDate: "2035-01-04", status: "skipped", optimoCompletionStatus: "success" },
    ]);

    const { payment } = await getCustomer360(u.publicId);
    expect(payment).toMatchObject({
      totalPaid: 50, paidCount: 1, lastPaidAt: 1_000,
      outstanding: { count: 1, amount: 20 }, refunded: 15, lastDeliveredDate: "2035-01-02",
    });
  });
});
