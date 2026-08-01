import { describe, expect, it } from "vitest";
import { formatPortion, portionForPick, portionsByCategory } from "../pick-size";

const item = (
  category: string,
  qty: number,
  weightValue: string | null,
  sortOrder = 0,
  weightUnit: "oz" | "g" | "ml" | "piece" | null = weightValue ? "oz" : null,
) => ({ category, qty, weightValue, weightUnit, sortOrder });

describe("formatPortion", () => {
  it("trims the numeric noise a numeric(6,2) column carries", () => {
    expect(formatPortion("8.00", "oz")).toBe("8oz");
    expect(formatPortion("2.50", "oz")).toBe("2.5oz");
    expect(formatPortion("250.00", "ml")).toBe("250ml");
    expect(formatPortion("2.00", "piece")).toBe("2 pc");
  });

  it("is null when the catalog line has no weight", () => {
    expect(formatPortion(null, "oz")).toBeNull();
    expect(formatPortion("8.00", null)).toBeNull();
    expect(formatPortion("not-a-number", "oz")).toBeNull();
  });
});

describe("portionsByCategory", () => {
  it("expands qty into one slot per container", () => {
    const portions = portionsByCategory([item("sabzi", 2, "8.00")]);
    expect(portions.get("sabzi")).toEqual(["8oz", "8oz"]);
  });

  it("keeps differently-sized lines of one category in sortOrder", () => {
    // The shape that makes this necessary: 1x12oz main + 2x8oz sides, all "sabzi".
    const portions = portionsByCategory([
      item("sabzi", 2, "8.00", 2),
      item("sabzi", 1, "12.00", 1),
    ]);
    expect(portions.get("sabzi")).toEqual(["12oz", "8oz", "8oz"]);
  });

  it("keeps categories independent", () => {
    const portions = portionsByCategory([item("sabzi", 1, "12.00"), item("dal", 1, "8.00")]);
    expect(portions.get("sabzi")).toEqual(["12oz"]);
    expect(portions.get("dal")).toEqual(["8oz"]);
  });

  it("yields null slots for lines with no weight, without shifting the others", () => {
    const portions = portionsByCategory([item("roti", 1, null, 1), item("roti", 1, "8.00", 2)]);
    expect(portions.get("roti")).toEqual([null, "8oz"]);
  });

  it("ignores a non-positive qty rather than emitting a phantom container", () => {
    expect(portionsByCategory([item("sabzi", 0, "8.00")]).get("sabzi")).toEqual([]);
  });
});

describe("portionForPick", () => {
  const portions = portionsByCategory([item("sabzi", 1, "12.00", 1), item("sabzi", 2, "8.00", 2)]);

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
