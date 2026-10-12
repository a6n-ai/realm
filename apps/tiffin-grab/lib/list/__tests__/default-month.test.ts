import { describe, expect, it } from "vitest";
import { isoDateInZone } from "@/lib/analytics/profitability";
import { fillDefaultMonth, withListDates } from "@/lib/list/default-month";

const TZ = "America/Toronto";
const now = Date.parse("2035-03-10T16:00:00Z");

describe("fillDefaultMonth", () => {
  it("fills a missing range with the current business month", () => {
    const sp = fillDefaultMonth({} as { from?: string; to?: string }, TZ, now);
    expect(isoDateInZone(Number(sp.from), TZ)).toBe("2035-03-01");
    expect(isoDateInZone(Number(sp.to), TZ)).toBe("2035-03-31");
  });

  it("keeps an explicit bound", () => {
    expect(fillDefaultMonth({ from: "100" }, TZ, now)).toEqual({ from: "100" });
    expect(fillDefaultMonth({ from: "100", to: "200" }, TZ, now)).toEqual({ from: "100", to: "200" });
  });
});

describe("withListDates", () => {
  it("drops the date range while a text search is active", async () => {
    expect(await withListDates({ q: " tomar ", from: "100", to: "200", page: "2" })).toEqual({
      q: " tomar ",
      from: undefined,
      to: undefined,
      page: "2",
    });
  });

  it("keeps an explicit range when the search box is empty", async () => {
    expect(await withListDates({ q: "  ", from: "100", to: "200" })).toEqual({ q: "  ", from: "100", to: "200" });
  });
});
