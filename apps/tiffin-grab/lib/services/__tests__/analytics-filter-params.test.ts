import { describe, expect, it } from "vitest";
import { analyticsHref } from "@/lib/analytics/shared-filter-params";
import { currentMonthEpochRange } from "@/lib/dates/epoch-window";
import { isoDateInZone } from "@foundry/commons/util/dates";

const TZ = "America/Toronto";
const now = Date.parse("2035-03-10T16:00:00Z");

describe("currentMonthEpochRange", () => {
  it("covers the full calendar month in the business timezone", () => {
    const { from, to } = currentMonthEpochRange(TZ, now);
    expect(isoDateInZone(from, TZ)).toBe("2035-03-01");
    expect(isoDateInZone(to, TZ)).toBe("2035-03-31");
  });
});

describe("analyticsHref", () => {
  it("carries the franchise along with the date and facet filters", () => {
    expect(analyticsHref("/dashboard/analytics/revenue", { from: "1", to: "2", org: "a,b", plan: "veg", junk: "x" })).toBe(
      "/dashboard/analytics/revenue?from=1&to=2&plan=veg&org=a%2Cb",
    );
    expect(analyticsHref("/x", {})).toBe("/x");
  });
});
