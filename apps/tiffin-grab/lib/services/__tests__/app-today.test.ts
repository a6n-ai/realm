import { describe, expect, it } from "vitest";
import { nextWeekday } from "@foundry/commons";
import { appToday } from "../start-date";

describe("appToday", () => {
  it("uses the app timezone's date, not UTC's", () => {
    // Thu Oct 1, 8:30 PM in Toronto is already Fri Oct 2 in UTC.
    const evening = Date.parse("2026-10-02T00:30:00Z");
    expect(appToday("America/Toronto", evening).toISOString().slice(0, 10)).toBe("2026-10-01");
    // So the earliest start stays Fri Oct 2 instead of jumping to Mon Oct 5.
    expect(nextWeekday(appToday("America/Toronto", evening)).toISOString().slice(0, 10)).toBe("2026-10-02");
  });
});
