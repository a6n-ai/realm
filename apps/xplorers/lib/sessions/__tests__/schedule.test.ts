import { describe, expect, it } from "vitest";
import { fromZonedLocal } from "../timezone";
import { assertSameCalendarDay, fromZonedClock, occurrenceStartsAt, parseDates, parseDay } from "../schedule";

const zone = "Asia/Singapore";

describe("class dates", () => {
  it("dedupes and sorts calendar days", () => {
    expect(parseDates(["2026-09-24", "2026-09-22", "2026-09-22", ""])).toEqual(["2026-09-22", "2026-09-24"]);
  });

  it("rejects a class that spans two calendar days", () => {
    expect(() =>
      assertSameCalendarDay(
        fromZonedLocal("2026-09-22T16:00", zone),
        fromZonedLocal("2026-09-23T17:30", zone),
        zone,
      ),
    ).toThrow(/one day/);
  });

  it("applies the class clock to another date", () => {
    const startsAt = fromZonedLocal("2026-09-22T16:00", zone);
    expect(occurrenceStartsAt("2026-09-24", startsAt, zone).toISOString()).toBe(
      fromZonedLocal("2026-09-24T16:00", zone).toISOString(),
    );
  });

  it("stores a class clock on the sentinel day", () => {
    expect(fromZonedClock("16:00", zone).toISOString()).toBe(fromZonedLocal("2000-01-01T16:00", zone).toISOString());
  });

  it("rejects a missing calendar day", () => {
    expect(() => parseDay("Tuesday")).toThrow(/calendar day/);
  });
});
