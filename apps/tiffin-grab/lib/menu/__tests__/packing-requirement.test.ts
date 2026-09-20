import { describe, expect, it } from "vitest";
import {
  addDishPortion,
  formatDishCell,
  formatItemCell,
  formatPackingRequirement,
  formatPortionUnit,
} from "../packing-requirement";

describe("formatPortionUnit", () => {
  it("uppercases oz weight labels and leaves count labels intact", () => {
    expect(formatPortionUnit("12oz")).toBe("12 OZ");
    expect(formatPortionUnit("8 oz")).toBe("8 OZ");
    expect(formatPortionUnit("4 roti")).toBe("4 roti");
  });
});

describe("formatPackingRequirement", () => {
  it("renders portion × quantity for kitchen scanning", () => {
    expect(formatPackingRequirement("12oz", 1)).toBe("12 OZ × 1");
    expect(formatPackingRequirement("8oz", 2)).toBe("8 OZ × 2");
    expect(formatPackingRequirement("4 roti", 1)).toBe("4 roti × 1");
  });
});

describe("formatItemCell", () => {
  it("puts dish name and converted portion in one cell", () => {
    expect(formatItemCell({ name: "Chicken Curry", portion: "12oz", quantity: 1 })).toBe(
      "Chicken Curry — 12 OZ × 1",
    );
    expect(formatItemCell({ name: "Roti", portion: "1 roti", quantity: 8 })).toBe("Roti — 1 roti × 8");
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
