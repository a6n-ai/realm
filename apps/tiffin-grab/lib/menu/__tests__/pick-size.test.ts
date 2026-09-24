import { describe, expect, it } from "vitest";
import { categoryCountsFromItems, formatPortion, portionForPick, portionsByCategory, sumTuForPicks } from "../pick-size";
import type { TuCategory } from "@/lib/menu/format-tu";

const WEIGHT: TuCategory = { tuUnitType: "weight", tuUnitSize: 8, tuUnitLabel: "oz" };
const ROTI: TuCategory = { tuUnitType: "count", tuUnitSize: 4, tuUnitLabel: "roti" };

const cats = new Map<string, TuCategory>([
  ["sabzi", WEIGHT],
  ["dal", WEIGHT],
  ["roti", ROTI],
]);

const item = (category: string, tuAmount: string | null, sortOrder = 0) => ({ category, tuAmount, sortOrder });

describe("formatPortion", () => {
  it("converts TU into the category's natural unit", () => {
    expect(formatPortion("1.00", WEIGHT)).toBe("8oz");
    expect(formatPortion("1.50", WEIGHT)).toBe("12oz");
    expect(formatPortion("0.25", ROTI)).toBe("1 roti");
  });

  it("is null when the catalog line or category carries no TU", () => {
    expect(formatPortion(null, WEIGHT)).toBeNull();
    expect(formatPortion("1.00", null)).toBeNull();
    expect(formatPortion("not-a-number", WEIGHT)).toBeNull();
  });
});

describe("portionsByCategory", () => {
  it("gives one slot per row", () => {
    const portions = portionsByCategory([item("sabzi", "1.00"), item("sabzi", "1.00")], cats);
    expect(portions.get("sabzi")).toEqual(["8oz", "8oz"]);
  });

  it("keeps differently-sized lines of one category in sortOrder", () => {
    // The shape that makes this necessary: 1x12oz main + 2x8oz sides, all "sabzi".
    const portions = portionsByCategory([
      item("sabzi", "1.00", 2),
      item("sabzi", "1.00", 3),
      item("sabzi", "1.50", 1),
    ], cats);
    expect(portions.get("sabzi")).toEqual(["12oz", "8oz", "8oz"]);
  });

  it("keeps categories independent", () => {
    const portions = portionsByCategory([item("sabzi", "1.50"), item("dal", "1.00")], cats);
    expect(portions.get("sabzi")).toEqual(["12oz"]);
    expect(portions.get("dal")).toEqual(["8oz"]);
  });

  it("yields null slots for lines with no TU, without shifting the others", () => {
    const portions = portionsByCategory([item("roti", null, 1), item("roti", "0.25", 2)], cats);
    expect(portions.get("roti")).toEqual([null, "1 roti"]);
  });

  it("rolls up non-selectable category portions (e.g. 6 roti rows @ 0.25 TU -> 6 roti)", () => {
    const fixedCats = new Map<string, TuCategory>([
      ["roti", { ...ROTI, selectable: false }],
      ["rice", { tuUnitType: "count", tuUnitSize: 1, tuUnitLabel: "unit", selectable: false }],
      ["sabzi", { ...WEIGHT, selectable: true }],
    ]);
    const items = [
      item("roti", "0.25", 1),
      item("roti", "0.25", 2),
      item("roti", "0.25", 3),
      item("roti", "0.25", 4),
      item("roti", "0.25", 5),
      item("roti", "0.25", 6),
      item("rice", "1.00", 1),
      item("sabzi", "1.50", 1),
      item("sabzi", "1.00", 2),
    ];
    const portions = portionsByCategory(items, fixedCats);
    expect(portions.get("roti")).toEqual(["6 roti"]);
    expect(portions.get("rice")).toEqual(["1 unit"]);
    expect(portions.get("sabzi")).toEqual(["12oz", "8oz"]);
  });

  it("rolls up non-selectable category portions after swaps (4 roti -> 1 rice)", () => {
    const fixedCats = new Map<string, TuCategory>([
      ["roti", { ...ROTI, selectable: false }],
      ["rice", { tuUnitType: "count", tuUnitSize: 1, tuUnitLabel: "unit", selectable: false }],
    ]);
    const items = [
      item("roti", "0.25", 1),
      item("roti", "0.25", 2),
      item("roti", "0.25", 3),
      item("roti", "0.25", 4),
      item("roti", "0.25", 5),
      item("roti", "0.25", 6),
      item("rice", "1.00", 1),
    ];
    const afterSwap = portionsByCategory(items, fixedCats, [
      { fromCategory: "roti", toCategory: "rice", qtyFrom: 4, qtyTo: 1 },
    ]);
    expect(afterSwap.get("roti")).toEqual(["2 roti"]);
    expect(afterSwap.get("rice")).toEqual(["2 unit"]);
  });

  it("yields [] for non-selectable category when all slots are swapped away", () => {
    const fixedCats = new Map<string, TuCategory>([
      ["roti", { ...ROTI, selectable: false }],
      ["rice", { tuUnitType: "count", tuUnitSize: 1, tuUnitLabel: "unit", selectable: false }],
    ]);
    const items = [
      item("roti", "0.25", 1),
      item("roti", "0.25", 2),
      item("roti", "0.25", 3),
      item("roti", "0.25", 4),
    ];
    const afterSwap = portionsByCategory(items, fixedCats, [
      { fromCategory: "roti", toCategory: "rice", qtyFrom: 4, qtyTo: 1 },
    ]);
    expect(afterSwap.get("roti")).toEqual([]);
  });

  it("yields [null] for non-selectable category when all slots have null TU", () => {
    const fixedCats = new Map<string, TuCategory>([
      ["roti", { ...ROTI, selectable: false }],
    ]);
    const items = [item("roti", null, 1), item("roti", null, 2)];
    const portions = portionsByCategory(items, fixedCats);
    expect(portions.get("roti")).toEqual([null]);
  });
});

describe("sumTuForPicks", () => {
  it("sums catalog TU for N picks, wrapping when persons repeat the same slots", () => {
    const roti = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => item("roti", "0.25", i));
    expect(sumTuForPicks(roti, "roti", 8)).toBe(2);
    expect(sumTuForPicks(roti, "roti", 16)).toBe(4);
  });

  it("sums mixed sabzi slots in sortOrder", () => {
    const sabzi = [item("sabzi", "1.50", 0), item("sabzi", "1.00", 1)];
    expect(sumTuForPicks(sabzi, "sabzi", 2)).toBe(2.5);
  });
});

describe("portionForPick", () => {
  const portions = portionsByCategory([
    item("sabzi", "1.50", 1),
    item("sabzi", "1.00", 2),
    item("sabzi", "1.00", 3),
  ], cats);

  it("is 1-based, matching meal_selections.pickIndex", () => {
    expect(portionForPick(portions, "sabzi", 1)).toBe("12oz");
    expect(portionForPick(portions, "sabzi", 2)).toBe("8oz");
    expect(portionForPick(portions, "sabzi", 3)).toBe("8oz");
  });

  it("is null past the end, and for a category the meal size has no lines for", () => {
    // categoryCounts can outrun the meal size if the catalog was edited after checkout.
    expect(portionForPick(portions, "sabzi", 4)).toBeNull();
    expect(portionForPick(portions, "raita", 1)).toBeNull();
  });
});

describe("categoryCountsFromItems", () => {
  it("derives category counts by counting composition rows per category", () => {
    const items = [
      item("sabzi", "1.50", 1),
      item("daal", "1.50", 2),
      item("sabzi", "1.00", 3),
      item("roti", "0.25", 4),
      item("roti", "0.25", 5),
    ];
    expect(categoryCountsFromItems(items)).toEqual({
      sabzi: 2,
      daal: 1,
      roti: 2,
    });
  });

  it("returns empty object for empty composition", () => {
    expect(categoryCountsFromItems([])).toEqual({});
  });
});
