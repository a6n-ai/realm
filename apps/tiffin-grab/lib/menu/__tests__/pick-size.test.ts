import { describe, expect, it } from "vitest";
import { formatPortion, portionForPick, portionsByCategory } from "../pick-size";
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
