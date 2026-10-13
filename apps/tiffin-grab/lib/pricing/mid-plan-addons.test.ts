import { describe, expect, it } from "vitest";
import { addAddonsToSnapshot } from "./mid-plan-addons";
import type { OrderPricingSnapshot } from "./types";

const HST = [{ name: "HST", ratePct: 13 }];

// Druv Sharma's order ord_Z1UyH3GdF3gi as stored in prod on 2026-10-13.
const druv: OrderPricingSnapshot = {
  lineItems: [{ label: "Tiffins (20 × $12.50)", amount: 250 }],
  adjustments: [{ label: "7% off all plan lengths (7%)", amount: 17.5, discountKey: "7-off-all-plan-lengths" }],
  taxLines: [{ name: "HST", ratePct: 13, amount: 30.23 }],
  taxTotal: 30.23,
  tiffinCount: 20,
  perTiffinPrice: 12.5,
  subtotal: 250,
  total: 262.73,
  paymentMethodId: "etransfer",
};

const rotiAndRice = [
  { name: "Roti", pricePerTiffin: 0.5, qty: 2 },
  { name: "Rice", pricePerTiffin: 1.05, qty: 1 },
];

describe("addAddonsToSnapshot", () => {
  it("bills each add-on for the open tiffins only and taxes just that amount", () => {
    const r = addAddonsToSnapshot(druv, rotiAndRice, 17, HST);
    expect(r.lines).toEqual([
      { label: "Roti ×2 (add-on, 17 × $0.50)", amount: 17 },
      { label: "Rice (add-on, 17 × $1.05)", amount: 17.85 },
    ]);
    expect(r.addonSubtotal).toBe(34.85);
    expect(r.taxTotal).toBe(4.53);
    expect(r.amountDue).toBe(39.38);
  });

  it("adds onto the snapshot without touching the meal line or the discount", () => {
    const { snapshot } = addAddonsToSnapshot(druv, rotiAndRice, 17, HST);
    expect(snapshot.lineItems[0]).toEqual(druv.lineItems[0]);
    expect(snapshot.lineItems).toHaveLength(3);
    expect(snapshot.adjustments).toEqual(druv.adjustments);
    expect(snapshot.subtotal).toBe(284.85);
    expect(snapshot.taxLines).toEqual([{ name: "HST", ratePct: 13, amount: 34.76 }]);
    expect(snapshot.taxTotal).toBe(34.76);
    expect(snapshot.total).toBe(302.11);
    expect(snapshot.perTiffinPrice).toBe(12.5);
    expect(snapshot.tiffinCount).toBe(20);
    expect(snapshot.paymentMethodId).toBe("etransfer");
  });

  it("does not mutate the snapshot it was given", () => {
    const before = structuredClone(druv);
    addAddonsToSnapshot(druv, rotiAndRice, 17, HST);
    expect(druv).toEqual(before);
  });

  it("empty tax lines: a migrated WordPress order gets its first tax line appended", () => {
    const wp: OrderPricingSnapshot = {
      lineItems: [{ label: "4 Item Veg Thali Meal (Large) (prepaid on WordPress, order #15552)", amount: 0 }],
      adjustments: [], taxLines: [], taxTotal: 0, tiffinCount: 3, perTiffinPrice: 0, subtotal: 0, total: 0,
      paymentMethodId: "simulated",
    };
    const r = addAddonsToSnapshot(wp, [{ name: "Roti", pricePerTiffin: 0.5, qty: 2 }], 3, HST);
    expect(r.amountDue).toBe(3.39);
    expect(r.snapshot.taxLines).toEqual([{ name: "HST", ratePct: 13, amount: 0.39 }]);
    expect(r.snapshot.total).toBe(3.39);
  });

  it("no taxes: the amount due is the add-on subtotal", () => {
    const r = addAddonsToSnapshot(druv, rotiAndRice, 17, []);
    expect(r.taxTotal).toBe(0);
    expect(r.amountDue).toBe(34.85);
    expect(r.snapshot.taxLines).toEqual(druv.taxLines);
    expect(r.snapshot.total).toBe(297.58);
  });

  it("a tax with a different rate is its own line, not merged into HST", () => {
    const r = addAddonsToSnapshot(druv, rotiAndRice, 17, [{ name: "HST", ratePct: 15 }]);
    expect(r.snapshot.taxLines).toEqual([
      { name: "HST", ratePct: 13, amount: 30.23 },
      { name: "HST", ratePct: 15, amount: 5.23 },
    ]);
  });
});
