import { describe, expect, it, vi } from "vitest";
vi.mock("@/db/client", () => ({ db: {} }));
const { orderCosting } = await import("../meal-cost");

describe("orderCosting", () => {
  const a = { driverCostPerTiffin: 3, otherCostPerTiffin: 0, targetMarginPct: 25, minMarginPct: 0 };

  it("costs food + driver per tiffin, floor at cost, target grossed up by the margin", () => {
    // 20 tiffins of $6 food + $3 driver = $180; 25% margin needs a $240 pre-tax total.
    expect(orderCosting(6, 20, a)).toEqual({ cost: 180, floor: 180, target: 240, targetMarginPct: 25, minMarginPct: 0 });
  });

  it("raises the floor with a minimum margin", () => {
    expect(orderCosting(6, 20, { ...a, minMarginPct: 10 })?.floor).toBe(200);
  });

  it("returns null without tiffins", () => {
    expect(orderCosting(6, 0, a)).toBeNull();
  });
});
