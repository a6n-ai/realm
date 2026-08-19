import { describe, expect, it } from "vitest";
import { formatTuHuman, mealChipLabel } from "../format-tu";

describe("formatTuHuman", () => {
  it("formats a weight category at fractional TU", () => {
    expect(formatTuHuman({ tuUnitType: "weight", tuUnitSize: 8, tuUnitLabel: "oz" }, 1.5)).toBe("12oz");
  });

  it("formats a count category (roti, 4/TU) at whole TU", () => {
    expect(formatTuHuman({ tuUnitType: "count", tuUnitSize: 4, tuUnitLabel: "roti" }, 1)).toBe("4 roti");
  });

  it("formats a count category (roti, 4/TU) at half TU", () => {
    expect(formatTuHuman({ tuUnitType: "count", tuUnitSize: 4, tuUnitLabel: "roti" }, 0.5)).toBe("2 roti");
  });

  it("formats a count category (rice, 1/TU) at whole TU", () => {
    expect(formatTuHuman({ tuUnitType: "count", tuUnitSize: 1, tuUnitLabel: "unit" }, 1)).toBe("1 unit");
  });
});

describe("mealChipLabel", () => {
  it("appends the human portion and never says TU", () => {
    expect(mealChipLabel(1, "Sabzi", "12oz")).toBe("1× Sabzi · 12oz");
    expect(mealChipLabel(4, "Roti", "1 roti")).toBe("4× Roti · 1 roti");
    expect(mealChipLabel(2, "Dal")).toBe("2× Dal");
    expect(mealChipLabel(1, "Sabzi", "12oz")).not.toMatch(/\bTU\b/);
  });
});
