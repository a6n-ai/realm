import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ne } from "drizzle-orm";
import { nextWeekday } from "@foundry/commons";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
let session: unknown = { user: { id: "usr_signed_in" } };
vi.mock("@/lib/auth/session", () => ({ getSession: async () => session }));

let runtime: unknown = null;
vi.mock("@/lib/payments/stripe", async (orig) => ({ ...(await orig<object>()), stripeRuntime: async () => runtime }));
const calc = vi.fn(async (_s: unknown, i: { amountCents: number }) => {
  const taxCents = Math.round(i.amountCents * 0.13);
  return { calculationId: "taxcalc_t", taxCents, totalCents: i.amountCents + taxCents, expiresAt: Date.now() + 3_600_000, lines: [{ label: "HST", ratePct: 13, amountCents: taxCents }], reasons: [] };
});
vi.mock("@foundry/payments/stripe", async (orig) => ({ ...(await orig<object>()), calculateTax: (...a: [unknown, { amountCents: number }]) => calc(...a) }));

const { db } = await import("@/db/client");
const { deliveries, ledgerEntries, orderActivities, orders, payments, users, walletLedger } = await import("@/db/schema");
const { createOrder } = await import("../orders.service");
const { reprice } = await import("@/app/(public)/subscribe/actions");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");

async function reset() {
  await db.delete(walletLedger);
  await db.delete(ledgerEntries);
  await db.delete(deliveries);
  await db.delete(payments);
  await db.delete(orderActivities);
  await db.delete(orders);
  await db.delete(users).where(ne(users.isSystem, true));
}

async function input() {
  const snap = await loadCatalogSnapshot();
  return {
    planKey: snap.plans[0]!.key,
    selections: {
      mealSizeId: snap.mealSizes[0]!.publicId,
      frequencyKey: "5_day" as const,
      persons: 1,
      mealSlots: ["lunch"],
      includeSaturday: false,
      includeSunday: false,
      durationWeeks: 1,
      startDate: nextWeekday(new Date()).toISOString().slice(0, 10),
    },
    contact: {
      email: `s${Math.random().toString(36).slice(2)}@test.invalid`,
      fullName: "Stripe Tax Test",
      phone: "+16475550779",
      addressLine: "1 King St",
      city: "Toronto",
      postalCode: "M5V 2T6",
    },
    couponCode: null,
    paymentMethodId: null,
  };
}

describe("Stripe Tax: preview matches charge", () => {
  beforeEach(async () => { calc.mockClear(); runtime = null; session = { user: { id: "usr_signed_in" } }; await reset(); });
  afterAll(reset);

  it("with Stripe not connected the payment row records the fallback source", async () => {
    await createOrder(await input(), {});
    const [pay] = await db.select().from(payments);
    expect(pay!.taxSource).toBe("fallback");
    expect(pay!.taxCalculationId).toBeNull();
  });

  it("with an address the reprice goes through Stripe and equals the placed order total", async () => {
    runtime = { stripe: {}, cfg: { tax: { enabled: true, taxCode: "txcd_food", surchargeTaxable: false } } };
    const i = await input();
    const r = await reprice(i.selections, undefined, i.planKey, null, undefined, i.contact.postalCode, i.contact.addressLine, i.contact.city);
    if ("error" in r) throw new Error(r.error);
    expect(calc).toHaveBeenCalledTimes(1);
    expect(r.pricing.taxLines[0]!.name).toBe("HST");

    await createOrder(i, {});
    const [order] = await db.select().from(orders);
    expect(Number(order!.total)).toBeCloseTo(r.pricing.total, 2);
    const [pay] = await db.select().from(payments);
    expect(pay!.taxSource).toBe("stripe");
    expect(pay!.taxCalculationId).toBe("taxcalc_t");
  });

  it("before an address line exists the reprice does not call Stripe", async () => {
    runtime = { stripe: {}, cfg: { tax: { enabled: true, taxCode: "txcd_food", surchargeTaxable: false } } };
    const i = await input();
    await reprice(i.selections, undefined, i.planKey, null, undefined, i.contact.postalCode);
    expect(calc).not.toHaveBeenCalled();
  });

  it("an anonymous reprice with a full address never calls Stripe and uses the fallback estimate", async () => {
    runtime = { stripe: {}, cfg: { tax: { enabled: true, taxCode: "txcd_food", surchargeTaxable: false } } };
    session = null;
    const i = await input();
    const r = await reprice(i.selections, undefined, i.planKey, null, undefined, i.contact.postalCode, i.contact.addressLine, i.contact.city);
    if ("error" in r) throw new Error(r.error);
    expect(calc).not.toHaveBeenCalled();
    expect(r.pricing.taxTotal).toBeGreaterThan(0);
  });
});
