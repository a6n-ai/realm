import { describe, expect, it } from "vitest";
import { generatedLeadName, isQuickAdd, looksGeneratedName } from "../quick-add";

describe("quick-add helpers", () => {
  it("formats the generated name", () => {
    expect(generatedLeadName(1043)).toBe("Lead 1043");
  });

  it("is a quick add only while the stored number's name is untouched", () => {
    expect(isQuickAdd({ leadNumber: 7, fullName: "Lead 7" })).toBe(true);
    expect(isQuickAdd({ leadNumber: 7, fullName: "Priya S." })).toBe(false);
    expect(isQuickAdd({ leadNumber: null, fullName: "Lead 5" })).toBe(false); // hand-typed
    expect(isQuickAdd({ leadNumber: 7, fullName: "Lead 8" })).toBe(false);
  });

  it("spots generated-looking names in any case or spacing", () => {
    for (const n of ["Lead 5", "lead 5", "LEAD 5", " Lead  12 ", "lead5", "Lead #7"]) expect(looksGeneratedName(n)).toBe(true);
    for (const n of ["Priya S.", "Leader 5", "Lead", "Lead Singh", "5 Lead"]) expect(looksGeneratedName(n)).toBe(false);
  });
});
