import { describe, expect, it } from "vitest";
import { countsWithAddons, countsWithoutAddons } from "../order-addon-items";

describe("add-ons never count as swappable meal items", () => {
  it("strips one per add-on row, so swaps see only the meal's own counts", () => {
    const stored = countsWithAddons({ sabzi: 1, roti: 8 }, [{ category: "sabzi", qty: 1 }, { category: "daal", qty: 1 }]);
    expect(stored).toEqual({ sabzi: 2, roti: 8, daal: 1 });
    const rows = [{ category: "sabzi" }, { category: "daal" }];
    expect(countsWithoutAddons(stored, rows)).toEqual({ sabzi: 1, roti: 8, daal: 0 });
  });

  it("never goes below zero", () => {
    expect(countsWithoutAddons({ daal: 0 }, [{ category: "daal" }])).toEqual({ daal: 0 });
  });
});
