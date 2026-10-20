import { describe, expect, it } from "vitest";
import {
  currentMonthEpochRange,
  parseAnalyticsFilters,
} from "@/lib/services/analytics/shared-filter-params";
import { isoDateInZone } from "@/lib/analytics/profitability";

const TZ = "America/Toronto";
const now = Date.parse("2035-03-10T16:00:00Z");

describe("currentMonthEpochRange", () => {
  it("covers the full calendar month in the business timezone", () => {
    const { from, to } = currentMonthEpochRange(TZ, now);
    expect(isoDateInZone(from, TZ)).toBe("2035-03-01");
    expect(isoDateInZone(to, TZ)).toBe("2035-03-31");
  });
});

describe("parseAnalyticsFilters", () => {
  it("defaults missing dates to the current month when timezone is provided", () => {
    const f = parseAnalyticsFilters({}, { timezone: TZ, now });
    expect(isoDateInZone(f.from!, TZ)).toBe("2035-03-01");
    expect(isoDateInZone(f.to!, TZ)).toBe("2035-03-31");
  });

  it("keeps an explicit epoch range", () => {
    const f = parseAnalyticsFilters({ from: "100", to: "200" }, { timezone: TZ, now });
    expect(f.from).toBe(100);
    expect(f.to).toBe(200);
  });

  it("leaves dates unset without a timezone (callers that only need dimensions)", () => {
    const f = parseAnalyticsFilters({});
    expect(f.from).toBeUndefined();
    expect(f.to).toBeUndefined();
  });
});
