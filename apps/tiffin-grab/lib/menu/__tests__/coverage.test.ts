import { describe, expect, it } from "vitest";
import { assertCoverageUnits, coveredDates, mergeCoverage, tripCoverage } from "../coverage";

describe("coverage", () => {
  it("maps carried days to dates (Mon 2026-09-21)", () => {
    expect(tripCoverage("2026-09-21", "mon", ["mon", "tue"])).toEqual(["2026-09-21", "2026-09-22"]);
    expect(tripCoverage("2026-09-23", "wed", ["wed", "thu"])).toEqual(["2026-09-23", "2026-09-24"]);
    expect(tripCoverage("2026-09-25", "fri", ["fri"])).toEqual(["2026-09-25"]);
  });
  it("Friday trip carries Sat and Sun", () => {
    expect(tripCoverage("2026-09-25", "fri", ["fri", "sat", "sun"])).toEqual(["2026-09-25", "2026-09-26", "2026-09-27"]);
  });
  it("coveredDates falls back to the own date for legacy rows", () => {
    expect(coveredDates({ deliveryDate: "2026-09-21", coversDates: null })).toEqual(["2026-09-21"]);
    expect(coveredDates({ deliveryDate: "2026-09-21", coversDates: ["2026-09-21", "2026-09-22"] })).toHaveLength(2);
  });
  it("mergeCoverage unions and sorts", () => {
    expect(mergeCoverage(["2026-09-23", "2026-09-24"], ["2026-09-21", "2026-09-22", "2026-09-23"]))
      .toEqual(["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24"]);
  });
  it("assertCoverageUnits enforces units == days x persons", () => {
    expect(() => assertCoverageUnits({ coversDates: ["a", "b"], tiffinUnits: 4 }, 2)).not.toThrow();
    expect(() => assertCoverageUnits({ coversDates: ["a", "b"], tiffinUnits: 3 }, 2)).toThrow();
    expect(() => assertCoverageUnits({ coversDates: null, tiffinUnits: 3 }, 2)).not.toThrow();
  });
});

import { formatCoversLabel, fullDayName, swapAppliesTo } from "../coverage";

describe("customer copy helpers", () => {
  it("covers label only for multi-day trips", () => {
    expect(formatCoversLabel(["2030-01-07", "2030-01-08"])).toBe("Covers Mon + Tue");
    expect(formatCoversLabel(["2030-01-07"])).toBeNull();
    expect(fullDayName("2030-01-08")).toBe("Tuesday");
  });
  it("NULL for_date means the trip's own date", () => {
    expect(swapAppliesTo(null, "2030-01-07", "2030-01-07")).toBe(true);
    expect(swapAppliesTo(null, "2030-01-07", "2030-01-08")).toBe(false);
    expect(swapAppliesTo("2030-01-08", "2030-01-07", "2030-01-08")).toBe(true);
  });
});
