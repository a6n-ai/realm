import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ne } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { orders, payments, orderActivities, ledgerEntries, users, walletLedger, notifications, notificationOutbox, organization } = await import("@/db/schema");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");
const { nextWeekday } = await import("@foundry/commons");
const { createOrder } = await import("@/lib/services/orders.service");
const { addAddonsToSnapshot } = await import("@/lib/pricing/mid-plan-addons");
const { buildAnalyticsScope } = await import("../scope");
const { revenueTotals } = await import("../money");
const { needsReviewRows } = await import("../needs-review");
const { eq, inArray } = await import("drizzle-orm");

const TZ = "America/Toronto";
const MARCH_NOW = Date.parse("2026-03-15T16:00:00Z");
const CAPTURED_AT = Date.parse("2026-03-10T15:00:00Z");
const suffix = Math.random().toString(36).slice(2);
const orgs: Record<string, string> = {};
let n = 0;

async function wipe() {
  await db.delete(walletLedger);
  await db.delete(ledgerEntries);
  await db.delete(orderActivities);
  await db.delete(payments);
  await db.delete(orders);
  const customerIds = db.select({ id: users.id }).from(users).where(ne(users.isSystem, true));
  await db.delete(notificationOutbox).where(inArray(notificationOutbox.recipientId, customerIds));
  await db.delete(notifications).where(inArray(notifications.userId, customerIds));
  await db.delete(users).where(ne(users.isSystem, true));
}

const base = { lineItems: [], subtotal: 100, taxLines: [{ name: "HST", ratePct: 5, amount: 5 }], taxTotal: 5, total: 105 };

async function seed(key: string, snapshot: object, status: "active" | "cancelled" = "active") {
  const snap = await loadCatalogSnapshot();
  const k = n++;
  [{ id: orgs[key] }] = await db.insert(organization).values({ name: `Quote ${key}`, clientCode: `Q${k}-${suffix}` }).returning({ id: organization.id });
  const { publicId } = await createOrder({
    planKey: snap.plans[0].key,
    selections: { mealSizeId: snap.mealSizes[0].publicId, frequencyKey: "5_day", persons: 1, mealSlots: ["lunch"], includeSaturday: false, includeSunday: false, durationWeeks: 1, startDate: nextWeekday(new Date()).toISOString().slice(0, 10) },
    contact: { email: `q${k}${suffix}@test.invalid`, fullName: `Quote ${key}`, phone: `+1647556${String(1000 + k)}`, addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6" },
  });
  await db.update(orders).set({ organizationId: orgs[key], status, createdAt: CAPTURED_AT, pricingSnapshot: snapshot }).where(eq(orders.publicId, publicId));
  const [row] = await db.select({ id: orders.id, userId: orders.userId }).from(orders).where(eq(orders.publicId, publicId));
  await db.delete(ledgerEntries).where(eq(ledgerEntries.orderId, row.id));
  await db.delete(payments).where(eq(payments.orderId, row.id));
  return { ...row, publicId };
}
const pay = async (orderId: bigint, amount: number, over: Record<string, unknown> = {}) => {
  const [p] = await db.insert(payments).values({ orderId, amount: amount.toFixed(2), status: "paid", method: "stripe", capturedAt: CAPTURED_AT, createdAt: CAPTURED_AT, ...over } as never).returning({ id: payments.id });
  return p.id;
};
const scope = (key: string) => buildAnalyticsScope({}, [orgs[key]], TZ, MARCH_NOW);

describe("plan quote subtracts what was applied, not what was requested", () => {
  beforeAll(wipe);
  afterAll(async () => {
    await wipe();
    await db.delete(organization).where(inArray(organization.id, Object.values(orgs)));
  });

  it("partial apply (half the tiffins): plan stays 100.00, add-on keeps its own quote", async () => {
    // 10 tiffins x $2 at 10% = 22.00 requested; only 5 fit, so 11.00 is applied and 11.00 refunded.
    const snapshot = addAddonsToSnapshot({ ...base, taxLines: [{ name: "HST", ratePct: 10, amount: 5 }] } as never, [{ name: "Roti", qty: 1, pricePerTiffin: 2 }] as never, 5, [{ name: "HST", ratePct: 10 }]);
    expect(snapshot.snapshot.total).toBe(116);
    const o = await seed("partial", snapshot.snapshot);
    await pay(o.id, 105);
    const addon = await pay(o.id, 22, { addonRequest: { taxTotal: 2, amountDue: 22 } });
    await db.insert(ledgerEntries).values({ userId: o.userId!, orderId: o.id, paymentId: addon, direction: "debit", type: "refund", amount: "11.00", createdAt: CAPTURED_AT } as never);
    // plan 100 + add-on 22 x (1 - 2/22) = 20, minus the refund's ex-tax share 11 x 20/22 = 10
    expect((await revenueTotals(scope("partial"))).net).toBe(110);
  });

  it("add-on refunded without being applied: plan stays 100.00", async () => {
    const o = await seed("notapplied", base);
    await pay(o.id, 105);
    const addon = await pay(o.id, 22.6, { status: "refunded", addonRequest: { taxTotal: 2.6, amountDue: 22.6 } });
    await db.insert(ledgerEntries).values({ userId: o.userId!, orderId: o.id, paymentId: addon, direction: "debit", type: "refund", amount: "22.60", createdAt: CAPTURED_AT } as never);
    // plan 100 + add-on 20 - refund 20
    expect((await revenueTotals(scope("notapplied"))).net).toBe(100);
  });

  it("cancelled order whose only refund has no ledger row shows just refunded_no_ledger", async () => {
    const o = await seed("legacycancel", base, "cancelled");
    await pay(o.id, 105, { status: "refunded" });
    const rows = await needsReviewRows(scope("legacycancel"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ reasons: ["refunded_no_ledger"], kept: 0 });
  });

  it("coin-reduced order with a later partial refund reports both paid_ne_total and partly_refunded", async () => {
    const o = await seed("coinrefund", base);
    const p = await pay(o.id, 90);
    await db.insert(ledgerEntries).values({ userId: o.userId!, orderId: o.id, paymentId: p, direction: "debit", type: "refund", amount: "10.00", createdAt: CAPTURED_AT } as never);
    const rows = await needsReviewRows(scope("coinrefund"));
    expect(rows).toHaveLength(1);
    // paid 90 vs total 105 (gap before refunds), 10 refunded so 80 is kept: diff = kept - total.
    expect(rows[0]).toMatchObject({ reasons: ["paid_ne_total", "partly_refunded"], paid: 90, total: 105, kept: 80, diff: -25 });
  });
});
