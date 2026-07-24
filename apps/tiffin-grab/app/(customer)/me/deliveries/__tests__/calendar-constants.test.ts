// @vitest-environment node
import { describe, expect, it } from "vitest";
import { monthFetchRange, parseMonthParam } from "../calendar-constants";

describe("calendar month helpers", () => {
  it("monthFetchRange spans the calendar month", () => {
    expect(monthFetchRange("2026-07", "2026-06-01")).toEqual({ from: "2026-07-01", until: "2026-07-31" });
  });

  it("parseMonthParam defaults to this month and clamps past months", () => {
    expect(parseMonthParam(undefined, "2026-07-20")).toBe("2026-07");
    expect(parseMonthParam("2026-06", "2026-07-20")).toBe("2026-07");
  });

  it("monthFetchRange does not start before today in the current month", () => {
    expect(monthFetchRange("2026-07", "2026-07-22")).toEqual({ from: "2026-07-22", until: "2026-07-31" });
  });
});
