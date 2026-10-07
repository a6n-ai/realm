import { describe, expect, it } from "vitest";
import { itemsForRow, rowDietLabel, rowPlanIds, rowPlansAfterSwaps } from "../row-plans";

const VEG = 1n;
const NONVEG = 2n;

// 1 Non-Veg Sabzi 8oz + 1 Veg Sabzi 12oz (base) + 1 Veg Sabzi 8oz (a WordPress add-on) + roti.
const customItems = [
  { category: "roti", planId: NONVEG, sortOrder: 0 },
  { category: "sabzi", planId: VEG, sortOrder: 4 },
  { category: "sabzi", planId: NONVEG, sortOrder: 3 },
  { category: "sabzi", planId: VEG, sortOrder: 5 },
];

describe("rowPlanIds", () => {
  it("maps each pick of a custom meal to its own row's plan, in sortOrder", () => {
    const plans = rowPlanIds(customItems, true)!;
    expect(plans.get("sabzi")).toEqual([NONVEG, VEG, VEG]);
    expect(plans.get("roti")).toEqual([NONVEG]);
  });

  it("is null for catalog sizes — their rows stay a union of reachable plans", () => {
    expect(rowPlanIds(customItems, false)).toBeNull();
  });
});

describe("itemsForRow", () => {
  const chicken = { name: "Kadai Chicken", planId: NONVEG };
  const paneer = { name: "Paneer", planId: VEG };
  const menu = [paneer, chicken];
  const plans = rowPlanIds(customItems, true);

  it("offers a non-veg row only non-veg dishes and a veg row (incl. an add-on row) only veg dishes", () => {
    expect(itemsForRow(menu, plans, "sabzi", 1)).toEqual([chicken]);
    expect(itemsForRow(menu, plans, "sabzi", 2)).toEqual([paneer]);
    expect(itemsForRow(menu, plans, "sabzi", 3)).toEqual([paneer]);
  });

  it("compares string plan ids too (grid dishes carry planId as a string)", () => {
    const grid = [{ name: "Paneer", planId: "1" }, { name: "Kadai Chicken", planId: "2" }];
    expect(itemsForRow(grid, plans, "sabzi", 1).map((d) => d.name)).toEqual(["Kadai Chicken"]);
  });

  it("leaves the menu untouched without row plans, or for a pick past the rows", () => {
    expect(itemsForRow(menu, null, "sabzi", 1)).toEqual(menu);
    expect(itemsForRow(menu, plans, "sabzi", 4)).toEqual(menu);
  });

  it("keeps the whole menu when the row's diet has nothing on it that day", () => {
    expect(itemsForRow([paneer], plans, "sabzi", 1)).toEqual([paneer]);
  });
});

describe("rowDietLabel", () => {
  const keys = new Map([[VEG, "veg"], [NONVEG, "non-veg"]]);
  const plans = rowPlanIds(customItems, true);

  it("names each row's diet where a category mixes them", () => {
    expect(rowDietLabel(plans, keys, "sabzi", 1)).toBe("Non-Veg");
    expect(rowDietLabel(plans, keys, "sabzi", 3)).toBe("Veg");
  });

  it("stays silent for a single-diet category and for catalog sizes", () => {
    expect(rowDietLabel(plans, keys, "roti", 1)).toBeUndefined();
    expect(rowDietLabel(null, keys, "sabzi", 1)).toBeUndefined();
  });
});

describe("rowPlansAfterSwaps", () => {
  const VEG = 1n, NONVEG = 2n;
  // Deepak's custom meal: sabzi row 0 = non-veg 8oz, row 1 = veg 12oz.
  const plans = new Map([["sabzi", [NONVEG, VEG]], ["rice", [VEG]]]);
  it("giving up row 0 keeps row 1's own (veg) diet as the remaining sabzi; the received daal is plan-less", () => {
    const out = rowPlansAfterSwaps(plans, [{ fromCategory: "sabzi", toCategory: "daal", qtyFrom: 1, qtyTo: 1, fromRow: 0 }])!;
    expect(out.get("sabzi")).toEqual([VEG]);
    expect(out.get("daal")).toEqual([null]);
  });
  it("giving up row 1 leaves the non-veg row", () => {
    expect(rowPlansAfterSwaps(plans, [{ fromCategory: "sabzi", toCategory: "daal", qtyFrom: 1, qtyTo: 1, fromRow: 1 }])!.get("sabzi")).toEqual([NONVEG]);
  });
  it("no swaps or a catalog meal: unchanged", () => {
    expect(rowPlansAfterSwaps(plans, [])).toBe(plans);
    expect(rowPlansAfterSwaps(null, [{ fromCategory: "sabzi", toCategory: "daal", qtyFrom: 1, qtyTo: 1 }])).toBeNull();
  });
});
