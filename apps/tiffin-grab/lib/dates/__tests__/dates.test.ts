import { describe, expect, it } from "vitest";
import { isCutoffPassed } from "../cutoff";
import { parseIsoDate } from "../iso-date";

describe("isCutoffPassed", () => {
  it("locks at the exact cutoff instant", () => {
    expect(isCutoffPassed(1000, 999)).toBe(false);
    expect(isCutoffPassed(1000, 1000)).toBe(true);
    expect(isCutoffPassed(1000, 1001)).toBe(true);
  });
});

describe("parseIsoDate", () => {
  it("accepts real days only", () => {
    expect(parseIsoDate("2026-02-28")).toBe("2026-02-28");
    expect(parseIsoDate("2026-02-30")).toBeNull();
    expect(parseIsoDate("tomorrow")).toBeNull();
    expect(parseIsoDate(undefined)).toBeNull();
  });
});
