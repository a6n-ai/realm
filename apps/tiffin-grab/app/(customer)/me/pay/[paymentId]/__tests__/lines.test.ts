import { describe, expect, it } from "vitest";
import type { AddonRequest } from "@/db/schema";
import { payPageLines } from "../lines";

const snapshot = {
  lineItems: [{ label: "Veg plan", amount: 100 }],
  adjustments: [{ label: "Promo", amount: 10 }],
  taxLines: [{ name: "HST", ratePct: 13, amount: 11.7 }],
};

describe("payPageLines", () => {
  it("builds an order payment from the whole order snapshot", () => {
    const r = payPageLines({ amount: "101.70", addonRequest: null }, { pricingSnapshot: snapshot });
    expect(r.lines).toEqual([{ label: "Veg plan", amount: 100 }, { label: "Promo", amount: -10 }]);
    expect(r.taxLines).toEqual([{ label: "HST 13%", amount: 11.7 }]);
    expect(r.total).toBe(101.7);
  });

  it("builds an add-on payment from the request, not the order", () => {
    const addonRequest = {
      lines: [{ label: "Extra roti (3 tiffins)", amount: 6 }],
      taxes: [{ name: "HST", ratePct: 13, amount: 0.78 }],
      taxTotal: 0.78, addonSubtotal: 6, amountDue: 6.78,
    } as unknown as AddonRequest;
    const r = payPageLines({ amount: "6.78", addonRequest }, { pricingSnapshot: snapshot });
    expect(r.lines).toEqual([{ label: "Extra roti (3 tiffins)", amount: 6 }]);
    expect(r.taxLines).toEqual([{ label: "HST 13%", amount: 0.78 }]);
    expect(r.total).toBe(6.78);
  });

  it("falls back to one tax line when the quote has no per-tax amounts", () => {
    const addonRequest = {
      lines: [{ label: "Extra roti", amount: 6 }],
      taxes: [{ name: "HST", ratePct: 13 }],
      taxTotal: 0.78, addonSubtotal: 6, amountDue: 6.78,
    } as unknown as AddonRequest;
    expect(payPageLines({ amount: "6.78", addonRequest }, { pricingSnapshot: snapshot }).taxLines).toEqual([{ label: "Tax", amount: 0.78 }]);
  });
});
