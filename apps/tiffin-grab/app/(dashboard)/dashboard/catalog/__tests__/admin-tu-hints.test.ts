import { describe, expect, it } from "vitest";
import { naturalSwapConversion } from "../admin-tu-hints";

describe("naturalSwapConversion", () => {
  it("derives natural exchange from category TU settings (never hardcodes 4 roti)", () => {
    const roti = { key: "roti", label: "Roti", tuUnitType: "count" as const, tuUnitSize: 4, tuUnitLabel: "roti" };
    const rice = { key: "rice", label: "Rice", tuUnitType: "count" as const, tuUnitSize: 1, tuUnitLabel: "unit" };
    expect(naturalSwapConversion(roti, rice)).toEqual({
      tuLine: "1 TU ↔ 1 TU",
      naturalLine: "4 roti → 1 unit",
    });
  });

  it("updates when tuUnitSize changes", () => {
    const roti = { key: "roti", label: "Roti", tuUnitType: "count" as const, tuUnitSize: 5, tuUnitLabel: "roti" };
    const rice = { key: "rice", label: "Rice", tuUnitType: "count" as const, tuUnitSize: 1, tuUnitLabel: "unit" };
    expect(naturalSwapConversion(roti, rice)?.naturalLine).toBe("5 roti → 1 unit");
  });
});
