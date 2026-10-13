import { describe, expect, it, vi } from "vitest";
import { nextWeekday } from "@foundry/commons";
import { appToday } from "../start-date";

vi.unmock("@/lib/services/start-date");

describe("appToday", () => {
  it("uses the app timezone's date, not UTC's", () => {
    // Thu Oct 1, 8:30 PM in Toronto is already Fri Oct 2 in UTC.
    const evening = Date.parse("2026-10-02T00:30:00Z");
    expect(appToday("America/Toronto", undefined, evening).toISOString().slice(0, 10)).toBe("2026-10-01");
    // So the earliest start stays Fri Oct 2 instead of jumping to Mon Oct 5.
    expect(nextWeekday(appToday("America/Toronto", undefined, evening)).toISOString().slice(0, 10)).toBe("2026-10-02");
  });

  const earliest = (utc: string) => nextWeekday(appToday("America/Toronto", 18, Date.parse(utc))).toISOString().slice(0, 10);

  it("offers tomorrow until the cutoff hour, then the day after", () => {
    // Tue Oct 13 in Toronto (UTC-4): 5:59 PM, then 6:00 PM.
    expect(earliest("2026-10-13T21:59:00Z")).toBe("2026-10-14");
    expect(earliest("2026-10-13T22:00:00Z")).toBe("2026-10-15");
    // Just past midnight the 13th is today: its cutoff was the evening before.
    expect(earliest("2026-10-13T04:15:00Z")).toBe("2026-10-14");
  });

  it("keeps Monday open over the weekend until Sunday's cutoff", () => {
    expect(earliest("2026-10-17T00:30:00Z")).toBe("2026-10-19"); // Fri 8:30 PM
    expect(earliest("2026-10-18T19:00:00Z")).toBe("2026-10-19"); // Sun 3 PM
    expect(earliest("2026-10-18T23:00:00Z")).toBe("2026-10-20"); // Sun 7 PM
  });
});
