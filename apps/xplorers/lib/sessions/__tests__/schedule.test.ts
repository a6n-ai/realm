import { describe, expect, it } from "vitest";
import { parseDates, parseDay } from "../schedule";

describe("class dates", () => {
  it("dedupes and sorts calendar days", () => {
    expect(parseDates(["2026-09-24", "2026-09-22", "2026-09-22", ""])).toEqual(["2026-09-22", "2026-09-24"]);
  });

  it("rejects a missing calendar day", () => {
    expect(() => parseDay("Tuesday")).toThrow(/calendar day/);
  });
});
