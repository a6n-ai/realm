import { describe, expect, it } from "vitest";
import {
  addDishPortion,
  countPackNaturalTotal,
  countTotalFromPack,
  formatDishCell,
  formatItemCell,
  formatPackingRequirement,
  formatPortionUnit,
  labelLineTexts,
  packLines,
  splitContainers,
} from "../packing-requirement";

describe("formatPortionUnit", () => {
  it("writes oz weight labels as 12oz and leaves count labels intact", () => {
    expect(formatPortionUnit("12oz")).toBe("12oz");
    expect(formatPortionUnit("8 oz")).toBe("8oz");
    expect(formatPortionUnit("4 roti")).toBe("4 roti");
  });
});

describe("formatPackingRequirement", () => {
  it("drops × 1 and keeps × N for weight", () => {
    expect(formatPackingRequirement("12oz", 1)).toBe("12oz");
    expect(formatPackingRequirement("8oz", 2)).toBe("8oz × 2");
  });
});

describe("countTotalFromPack (size × count → total)", () => {
  it("multiplies pack size by pack count", () => {
    expect(countTotalFromPack("4 roti", 2)).toBe(8);
    expect(countTotalFromPack("1 unit", 2)).toBe(2);
    expect(countTotalFromPack("1 unit", 1)).toBe(1);
  });
});

describe("countPackNaturalTotal", () => {
  const rice = { tuUnitType: "count" as const, tuUnitSize: 1, tuUnitLabel: "unit" };
  const roti = { tuUnitType: "count" as const, tuUnitSize: 4, tuUnitLabel: "roti" };

  it("sums natural totals for summary", () => {
    expect(countPackNaturalTotal([1, 1], 2, rice, true)).toBe(2);
    expect(countPackNaturalTotal([2], 1, roti, true)).toBe(8);
  });
});

describe("formatItemCell", () => {
  it("weight: Dish - 8oz, × N only when more than one", () => {
    expect(formatItemCell({ name: "Moong Dal", portion: "8oz", quantity: 1 })).toBe("Moong Dal - 8oz");
    expect(formatItemCell({ name: "Soya Keema", portion: "8oz", quantity: 2 })).toBe("Soya Keema - 8oz × 2");
  });

  it("count: total first, or just the dish when it is one", () => {
    expect(formatItemCell({ name: "Roti", portion: "4 roti", quantity: 2, packStyle: "count-total" })).toBe("8 Rotis");
    expect(formatItemCell({ name: "Veg Pulao", portion: "1 unit", quantity: 1, packStyle: "count-total" })).toBe("Veg Pulao");
    expect(formatItemCell({ name: "Jeera Rice", portion: "1 unit", quantity: 2, packStyle: "count-total" })).toBe("2 Jeera Rice");
  });
});

describe("formatDishCell", () => {
  it("joins multiple portions and uses an em dash when empty", () => {
    expect(formatDishCell([])).toBe("—");
    expect(
      formatDishCell([
        { portion: "12oz", quantity: 1 },
        { portion: "8oz", quantity: 1 },
      ]),
    ).toBe("12oz; 8oz");
  });
});

describe("addDishPortion", () => {
  it("aggregates quantity per dish and portion", () => {
    const into = new Map<string, Map<string, number>>();
    addDishPortion(into, "Curry", "12oz", 1);
    addDishPortion(into, "Curry", "12oz", 1);
    addDishPortion(into, "Curry", "8oz", 1);
    expect(into.get("Curry")?.get("12oz")).toBe(2);
    expect(into.get("Curry")?.get("8oz")).toBe(1);
  });
});

describe("labelLineTexts", () => {
  it("merges repeat containers and formats counts like the packing sheet", () => {
    expect(
      labelLineTexts([
        { dish: "Soya Keema", portion: "8oz", defaulted: true },
        { dish: "Soya Keema", portion: "8oz", defaulted: false },
        { dish: "Moong Dal", portion: "12oz", defaulted: true },
        { dish: "Roti", portion: "8 roti", count: true, defaulted: true },
        { dish: "Rice", portion: "2 unit", count: true, defaulted: true },
        { dish: "Veg Pulao", portion: "1 unit", count: true, defaulted: true },
        { dish: "Moong Dal", portion: "12oz", addon: true, defaulted: false },
      ]),
    ).toEqual([
      { text: "Soya Keema - 8oz × 2", defaulted: false },
      { text: "Moong Dal - 12oz", defaulted: true },
      { text: "8 Rotis", defaulted: true },
      { text: "2 Rice", defaulted: true },
      { text: "Veg Pulao", defaulted: true },
      { text: "Moong Dal (add-on) - 12oz", defaulted: false },
    ]);
  });
});

describe("the kitchen packing language", () => {
  it("16oz is packed as two 8oz containers; 12oz and smaller stay whole", () => {
    expect(splitContainers("16oz")).toEqual(["8oz", "8oz"]);
    expect(splitContainers("12oz")).toEqual(["12oz"]);
    expect(splitContainers("4 roti")).toEqual(["4 roti"]);
  });

  it("folds add-on roti into one box total and splits 16oz before anyone counts", () => {
    expect(
      packLines([
        { dish: "Roti", portion: "2 roti", count: true, defaulted: true },
        { dish: "Roti", portion: "1 roti", count: true, addon: true, defaulted: false },
        { dish: "Dal Makhani", portion: "16oz", defaulted: true },
      ]),
    ).toEqual([
      { dish: "Roti", portion: "3 roti", count: true, addon: undefined, defaulted: false },
      { dish: "Dal Makhani", portion: "8oz", defaulted: true },
      { dish: "Dal Makhani", portion: "8oz", defaulted: true },
    ]);
  });

  it("reads the same on a label as in the sheet: one line per thing in the box", () => {
    expect(
      labelLineTexts([
        { dish: "Roti", portion: "2 roti", count: true, defaulted: false },
        { dish: "Roti", portion: "1 roti", count: true, addon: true, defaulted: false },
        { dish: "Dal Makhani", portion: "16oz", defaulted: false },
        { dish: "Raita", portion: "8oz", defaulted: false },
        { dish: "Paneer Butter Masala", portion: "12oz", defaulted: false },
      ]).map((t) => t.text),
    ).toEqual(["3 Rotis", "Dal Makhani - 8oz × 2", "Raita - 8oz", "Paneer Butter Masala - 12oz"]);
  });
});
