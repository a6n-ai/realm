import { describe, expect, it } from "vitest";
import {
  addDishPortion,
  countPackNaturalTotal,
  countPackSlotPortions,
  countTotalFromPack,
  formatDishCell,
  formatItemCell,
  formatPackingRequirement,
  formatPortionUnit,
  labelLineTexts,
} from "../packing-requirement";

describe("formatPortionUnit", () => {
  it("uppercases oz weight labels and leaves count labels intact", () => {
    expect(formatPortionUnit("12oz")).toBe("12 OZ");
    expect(formatPortionUnit("8 oz")).toBe("8 OZ");
    expect(formatPortionUnit("4 roti")).toBe("4 roti");
  });
});

describe("formatPackingRequirement", () => {
  it("drops × 1 and keeps × N for weight", () => {
    expect(formatPackingRequirement("12oz", 1)).toBe("12 OZ");
    expect(formatPackingRequirement("8oz", 2)).toBe("8 OZ × 2");
  });
});

describe("countTotalFromPack (size × count → total)", () => {
  it("multiplies pack size by pack count", () => {
    expect(countTotalFromPack("4 roti", 2)).toBe(8);
    expect(countTotalFromPack("1 unit", 2)).toBe(2);
    expect(countTotalFromPack("1 unit", 1)).toBe(1);
  });
});

describe("countPackSlotPortions", () => {
  const rice = { tuUnitType: "count" as const, tuUnitSize: 1, tuUnitLabel: "unit" };
  const roti = { tuUnitType: "count" as const, tuUnitSize: 4, tuUnitLabel: "roti" };

  it("emits one pack-size label per rice slot", () => {
    expect(countPackSlotPortions([1, 1], 2, rice, true)).toEqual(["1 unit", "1 unit"]);
  });

  it("emits one roti pack for a single 2-TU row", () => {
    expect(countPackSlotPortions([2], 1, roti, true)).toEqual(["8 roti"]);
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
  it("weight: Dish — 8 OZ, × N only when more than one", () => {
    expect(formatItemCell({ name: "Moong Dal", portion: "8oz", quantity: 1 })).toBe("Moong Dal — 8 OZ");
    expect(formatItemCell({ name: "Soya Keema", portion: "8oz", quantity: 2 })).toBe("Soya Keema — 8 OZ × 2");
  });

  it("count: Dish — total, or just the dish when it is one", () => {
    expect(formatItemCell({ name: "Roti", portion: "4 roti", quantity: 2, packStyle: "count-total" })).toBe("Roti — 8");
    expect(formatItemCell({ name: "Veg Pulao", portion: "1 unit", quantity: 1, packStyle: "count-total" })).toBe("Veg Pulao");
    expect(formatItemCell({ name: "Jeera Rice", portion: "1 unit", quantity: 2, packStyle: "count-total" })).toBe("Jeera Rice — 2");
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
    ).toBe("12 OZ; 8 OZ");
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
      { text: "Soya Keema — 8 OZ × 2", defaulted: false },
      { text: "Moong Dal — 12 OZ", defaulted: true },
      { text: "Roti — 8", defaulted: true },
      { text: "Rice — 2", defaulted: true },
      { text: "Veg Pulao", defaulted: true },
      { text: "Moong Dal (add-on) — 12 OZ", defaulted: false },
    ]);
  });
});
