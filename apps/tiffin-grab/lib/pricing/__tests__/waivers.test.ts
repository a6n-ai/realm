import { describe, expect, it } from "vitest";
import { calculateDeliveryCharge } from "@foundry/delivery";
import { deliveryWaiverLines, taxWaiverLine, type PricingWaiver } from "../waivers";

const calc = calculateDeliveryCharge({
  baseCharge: 5,
  deliveryStrategies: [
    { id: "up", name: "Upstairs", chargeType: "fixed", chargeValue: 1.5 },
    { id: "rec", name: "Reception", chargeType: "fixed", chargeValue: 2 },
  ],
  planPrice: 100,
});
const w = (o: Partial<PricingWaiver> & Pick<PricingWaiver, "kind">): PricingWaiver => ({ key: o.kind, strategyId: null, percent: 100, ...o });
const HST = [{ name: "HST", ratePct: 13 }];

describe("deliveryWaiverLines", () => {
  it("waives every delivery fee", () => {
    expect(deliveryWaiverLines(calc, [w({ kind: "waiver_delivery" })])).toEqual([
      { label: "Delivery fees waived", amount: 8.5, discountKey: "waiver_delivery" },
    ]);
  });

  it("waives only the base or one strategy, and uses the admin name", () => {
    expect(deliveryWaiverLines(calc, [w({ kind: "waiver_base", percent: 50 })])).toEqual([
      { label: "Base delivery charge waived (50%)", amount: 2.5, discountKey: "waiver_base" },
    ]);
    expect(deliveryWaiverLines(calc, [w({ kind: "waiver_strategy", strategyId: "up", name: "Launch offer" })])).toEqual([
      { label: "Launch offer", amount: 1.5, discountKey: "waiver_strategy" },
    ]);
  });

  it("overlapping waivers never waive a fee twice", () => {
    const lines = deliveryWaiverLines(calc, [w({ kind: "waiver_delivery", percent: 50 }), w({ kind: "waiver_base" })]);
    // base 5 fully by waiver_base; strategies 3.5 at 50% by waiver_delivery
    expect(lines.reduce((s, l) => s + l.amount, 0)).toBe(6.75);
    expect(lines.find((l) => l.discountKey === "waiver_base")?.amount).toBe(5);
  });

  it("no delivery charge, no lines", () => {
    expect(deliveryWaiverLines(undefined, [w({ kind: "waiver_delivery" })])).toEqual([]);
  });
});

describe("taxWaiverLine", () => {
  const taxOn = (b: number) => Math.round(b * 0.13 * 100) / 100;

  it("full waiver: the customer pays the pre-tax amount, tax still charged on the lowered price", () => {
    for (const base of [100, 57.37, 249.99, 0.5]) {
      const line = taxWaiverLine(base, HST, [w({ kind: "waiver_tax" })])!;
      const lowered = Math.round((base - line.amount) * 100) / 100;
      const total = Math.round((lowered + taxOn(lowered)) * 100) / 100;
      expect(total).toBeLessThanOrEqual(base);
      expect(base - total).toBeLessThan(0.02);
    }
  });

  it("partial waiver covers that share of the tax", () => {
    const line = taxWaiverLine(100, HST, [w({ kind: "waiver_tax", percent: 50 })])!;
    const lowered = 100 - line.amount;
    expect(Math.round((lowered + taxOn(lowered)) * 100) / 100).toBeLessThanOrEqual(106.5);
    expect(line.label).toBe("Tax covered by us (50%)");
  });

  it("nothing to cover without taxes or a tax waiver", () => {
    expect(taxWaiverLine(100, [], [w({ kind: "waiver_tax" })])).toBeNull();
    expect(taxWaiverLine(100, HST, [w({ kind: "waiver_base" })])).toBeNull();
  });
});
