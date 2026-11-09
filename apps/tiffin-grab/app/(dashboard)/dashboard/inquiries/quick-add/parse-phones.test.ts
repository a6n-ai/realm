import { describe, expect, it } from "vitest";
import { QUICK_ADD_MAX, parsePastedPhones } from "./parse-phones";

describe("parsePastedPhones", () => {
  it("splits on newlines and commas, trims and drops blanks", () => {
    expect(parsePastedPhones("647 555 1000\n\n, 6475551001 ,").phones).toEqual(["647 555 1000", "6475551001"]);
  });

  it("dedupes on digits, keeping the first spelling", () => {
    expect(parsePastedPhones("6475551000\n(647) 555-1000").phones).toEqual(["6475551000"]);
  });

  it("flags more than the cap", () => {
    const text = Array.from({ length: QUICK_ADD_MAX + 1 }, (_, i) => `64755${String(i).padStart(5, "0")}`).join("\n");
    expect(parsePastedPhones(text).tooMany).toBe(true);
    expect(QUICK_ADD_MAX).toBe(20);
  });

  it("returns nothing for whitespace", () => {
    expect(parsePastedPhones("   ").phones).toEqual([]);
  });
});
