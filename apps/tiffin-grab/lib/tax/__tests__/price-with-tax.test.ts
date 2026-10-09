import { describe, it, expect, vi, beforeEach } from "vitest";

const calc = vi.fn();
vi.mock("@/lib/payments/stripe", () => ({
  stripeRuntime: vi.fn(),
  toCents: (d: number) => Math.round(d * 100),
  fromCents: (c: number) => (c / 100).toFixed(2),
}));
vi.mock("@foundry/payments/stripe", async (orig) => ({ ...(await orig<object>()), calculateTax: (...a: unknown[]) => calc(...a) }));
vi.mock("@/lib/services/app-settings.service", () => ({ getProvinceTaxes: async () => ({}) }));
vi.mock("@/lib/cache", () => ({ sharedCache: () => ({ get: async () => undefined, set: async () => {} }) }));

const { stripeRuntime } = await import("@/lib/payments/stripe");
const { priceWithTax, resolveCheckoutTaxes } = await import("../checkout-taxes");
const { priceSubscription } = await import("@/lib/pricing/engine");
const { sel, catalog } = await import("@/lib/pricing/__tests__/fixtures");

const enabled = { stripe: {}, cfg: { tax: { enabled: true, taxCode: "txcd_food", surchargeTaxable: false } } };
const addr = { line1: "1 King St", city: "Toronto", postalCode: "M5H 2N2", province: "ON" };
const rt = stripeRuntime as ReturnType<typeof vi.fn>;

describe("priceWithTax", () => {
  beforeEach(() => { calc.mockReset(); rt.mockReset(); });

  it("uses Stripe's tax and total when enabled", async () => {
    rt.mockResolvedValue(enabled);
    calc.mockResolvedValue({ calculationId: "taxcalc_1", taxCents: 2600, totalCents: 22600, expiresAt: 9e12, lines: [{ label: "HST", ratePct: 13, amountCents: 2600 }], reasons: ["standard_rated"] });
    const r = await priceWithTax({ selections: sel({ durationWeeks: 4 }), catalog: catalog(10), address: addr, methodTaxes: [], reference: "quote" });
    expect(r.tax).toEqual({ source: "stripe", calculationId: "taxcalc_1", expiresAt: 9e12 });
    expect(r.pricing.taxLines).toEqual([{ name: "HST", ratePct: 13, amount: 26 }]);
    expect(r.pricing.taxTotal).toBe(26);
    expect(r.pricing.total).toBe(226);
    expect(calc.mock.calls[0]![1]).toMatchObject({ amountCents: 20000, taxCode: "txcd_food" });
  });

  it("falls back to province lines when Stripe errors", async () => {
    rt.mockResolvedValue(enabled);
    calc.mockRejectedValue(new Error("Stripe Tax timed out after 3000ms"));
    const r = await priceWithTax({ selections: sel({ durationWeeks: 4 }), catalog: catalog(10), address: addr, methodTaxes: [], reference: "quote" });
    expect(r.tax.source).toBe("fallback");
    expect(r.taxProvince).toBe("ON");
    expect(r.pricing.taxLines.map((l) => l.name)).toEqual(["HST"]);
  });

  it("falls back when Stripe Tax is disabled or Stripe is not connected", async () => {
    rt.mockResolvedValue(null);
    const r = await priceWithTax({ selections: sel(), catalog: catalog(10), address: addr, methodTaxes: [], reference: "quote" });
    expect(r.tax.source).toBe("fallback");
    expect(calc).not.toHaveBeenCalled();
  });

  it("does not call Stripe for a zero taxable base", async () => {
    rt.mockResolvedValue(enabled);
    const r = await priceWithTax({ selections: sel(), catalog: catalog(10), adjustments: [{ label: "Comp", amount: 9999 }], address: addr, methodTaxes: [], reference: "quote" });
    expect(calc).not.toHaveBeenCalled();
    expect(r.pricing.total).toBe(0);
  });

  it("fallback is exactly the old resolveCheckoutTaxes + priceSubscription result", async () => {
    rt.mockResolvedValue(null);
    const adjustments = [{ label: "Promo", amount: 7.5 }];
    const { taxes } = await resolveCheckoutTaxes({ postalCode: addr.postalCode, province: addr.province, methodTaxes: [] });
    const r = await priceWithTax({ selections: sel({ durationWeeks: 4 }), catalog: catalog(10), adjustments, address: addr, methodTaxes: [], reference: "quote" });
    expect(r.pricing).toEqual(priceSubscription(sel({ durationWeeks: 4 }), catalog(10), adjustments, taxes));
  });
});
