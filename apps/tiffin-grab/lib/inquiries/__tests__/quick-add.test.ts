import { describe, expect, it } from "vitest";
import { generatedLeadName, isQuickAdd } from "../quick-add";

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
});
