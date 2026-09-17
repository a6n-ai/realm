import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ne } from "drizzle-orm";
import { nextWeekday } from "@foundry/commons";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
// Anonymous checkout: no wallet, so the preview and the order differ only by tax.
vi.mock("@/lib/auth/session", () => ({ getSession: async () => null }));

const { db } = await import("@/db/client");
const { coupons, couponRedemptions, deliveries, ledgerEntries, orderActivities, orders, payments, users, walletLedger } =
  await import("@/db/schema");
const { createOrder } = await import("../orders.service");
const { reprice } = await import("@/app/(public)/subscribe/actions");
const { setPaymentConfig, setProvinceTaxes } = await import("../app-settings.service");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");
const { sharedCache } = await import("@/lib/cache");

async function reset() {
  await db.delete(walletLedger);
  await db.delete(ledgerEntries);
  await db.delete(couponRedemptions);
  await db.delete(coupons);
  await db.delete(deliveries);
  await db.delete(payments);
  await db.delete(orderActivities);
  await db.delete(orders);
  await db.delete(users).where(ne(users.isSystem, true));
  await setPaymentConfig({ methods: [] });
  await setProvinceTaxes({});
  await sharedCache("app-settings").evictAll();
}

async function inputFor(postalCode: string) {
  const snap = await loadCatalogSnapshot();
  const startDate = nextWeekday(new Date());
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
      startDate: startDate.toISOString().slice(0, 10),
    },
    contact: {
      email: `p${Math.random().toString(36).slice(2)}@test.invalid`,
      fullName: "Parity Test",
      phone: "+16475550778",
      addressLine: "1 St",
      city: "Toronto",
      postalCode,
    },
    couponCode: null,
    paymentMethodId: null,
  };
}

/**
 * The receipt a customer approves must be the amount the order records. These
 * two ran tax through separate code paths once, and the preview quietly omitted
 * provincial tax that createOrder charged.
 */
describe("checkout preview matches the placed order", () => {
  beforeEach(reset);
  afterAll(reset);

  it("quotes the same total it charges, tax included, for an Ontario address", async () => {
    const input = await inputFor("M5V 2T6");
    const preview = await reprice(input.selections, undefined, input.planKey, null, undefined, input.contact.postalCode);

    expect(preview.pricing.taxTotal).toBeGreaterThan(0);

    const { deploymentId } = await createOrder(input, {});
    const [order] = await db.select().from(orders).where(ne(orders.deploymentId, ""));
    expect(order!.deploymentId).toBe(deploymentId);
    expect(Number(order!.total)).toBeCloseTo(preview.pricing.total, 2);
  });

  it("quotes a different province differently, and still matches what is charged", async () => {
    // Alberta is 5% GST against Ontario's 13% HST — if the preview ignored the
    // address, these two would come out identical.
    const on = await inputFor("M5V 2T6");
    const ab = await inputFor("T2P 1J9");
    const onPreview = await reprice(on.selections, undefined, on.planKey, null, undefined, on.contact.postalCode);
    const abPreview = await reprice(ab.selections, undefined, ab.planKey, null, undefined, ab.contact.postalCode);

    expect(onPreview.pricing.taxTotal).toBeGreaterThan(abPreview.pricing.taxTotal);
    expect(abPreview.pricing.taxTotal).toBeCloseTo(abPreview.pricing.subtotal * 0.05, 2);

    const { deploymentId } = await createOrder(ab, {});
    const [order] = await db.select().from(orders).where(ne(orders.deploymentId, ""));
    expect(order!.deploymentId).toBe(deploymentId);
    expect(Number(order!.total)).toBeCloseTo(abPreview.pricing.total, 2);
  });

  it("shows no tax until an address is known, so the quote never overstates it", async () => {
    const input = await inputFor("M5V 2T6");
    const preview = await reprice(input.selections, undefined, input.planKey, null, undefined, undefined);
    expect(preview.pricing.taxTotal).toBe(0);
  });

  it("honours an admin rate override in the preview too", async () => {
    await setProvinceTaxes({ ON: [{ name: "HST", ratePct: 5 }] });
    await sharedCache("app-settings").evictAll();
    const input = await inputFor("M5V 2T6");
    const preview = await reprice(input.selections, undefined, input.planKey, null, undefined, input.contact.postalCode);
    expect(preview.pricing.taxTotal).toBeCloseTo(preview.pricing.subtotal * 0.05, 2);
  });
});
