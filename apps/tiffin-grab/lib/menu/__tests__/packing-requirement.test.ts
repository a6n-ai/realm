import { describe, expect, it } from "vitest";
import {
  addDishPortion,
  countPackNaturalTotal,
  countPackSlotPortions,
  formatCountFromPack,
  formatCountTotal,
  formatDishCell,
  formatItemCell,
  formatPackingRequirement,
  formatPortionUnit,
  pluralizeCountWord,
} from "../packing-requirement";

describe("formatPortionUnit", () => {
  it("uppercases oz weight labels and leaves count labels intact", () => {
    expect(formatPortionUnit("12oz")).toBe("12 OZ");
    expect(formatPortionUnit("8 oz")).toBe("8 OZ");
    expect(formatPortionUnit("4 roti")).toBe("4 roti");
  });
});

describe("formatPackingRequirement", () => {
  it("renders portion × quantity for weight kitchen scanning", () => {
    expect(formatPackingRequirement("12oz", 1)).toBe("12 OZ × 1");
    expect(formatPackingRequirement("8oz", 2)).toBe("8 OZ × 2");
  });
});

describe("formatCountFromPack (size × count → total)", () => {
  it("multiplies pack size by pack count for roti and rice", () => {
    expect(formatCountFromPack("4 roti", 2, "roti")).toBe("8 rotis");
    expect(formatCountFromPack("4 roti", 1, "roti")).toBe("4 rotis");
    expect(formatCountFromPack("1 unit", 2, "rice")).toBe("2 rice");
    expect(formatCountFromPack("1 unit", 1, "rice")).toBe("1 rice");
    expect(formatCountFromPack("8 roti", 1, "roti")).toBe("8 rotis");
  });
});

describe("formatCountTotal", () => {
  it("renders plain totals", () => {
    expect(formatCountTotal(8, "roti")).toBe("8 rotis");
    expect(formatCountTotal(2, "rice")).toBe("2 rice");
  });
});

describe("pluralizeCountWord", () => {
  it("pluralizes roti and leaves rice unchanged", () => {
    expect(pluralizeCountWord(1, "Roti")).toBe("roti");
    expect(pluralizeCountWord(8, "roti")).toBe("rotis");
    expect(pluralizeCountWord(2, "rice")).toBe("rice");
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
  it("puts dish name and converted portion in one cell for weight", () => {
    expect(formatItemCell({ name: "Chicken Curry", portion: "12oz", quantity: 1 })).toBe(
      "Chicken Curry — 12 OZ × 1",
    );
  });

  it("multiplies count pack size × quantity into a plain total", () => {
    expect(
      formatItemCell({
        name: "Roti",
        portion: "4 roti",
        quantity: 2,
        packStyle: "count-total",
        countWord: "roti",
      }),
    ).toBe("8 rotis");
    expect(
      formatItemCell({
        name: "Rice",
        portion: "1 unit",
        quantity: 2,
        packStyle: "count-total",
        countWord: "rice",
      }),
    ).toBe("2 rice");
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
    ).toBe("12 OZ × 1; 8 OZ × 1");
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
