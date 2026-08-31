import { describe, expect, it } from "vitest";
import { cutoffMsFor, tzOffsetMinutes, zonedDateIso } from "./zoned-time";

const TZ = "America/Toronto";

describe("tzOffsetMinutes (America/Toronto)", () => {
  it("is -300 in winter (EST)", () => {
    expect(tzOffsetMinutes(TZ, Date.UTC(2026, 0, 15, 12))).toBe(-300); // Jan
  });
  it("is -240 in summer (EDT)", () => {
    expect(tzOffsetMinutes(TZ, Date.UTC(2026, 6, 15, 12))).toBe(-240); // Jul
  });
});

describe("zonedDateIso", () => {
  it("returns the local calendar date in the zone", () => {
    // 2026-01-16 00:30 UTC is still 2026-01-15 (19:30) in Toronto
    expect(zonedDateIso(Date.UTC(2026, 0, 16, 0, 30), TZ)).toBe("2026-01-15");
  });
});

describe("cutoffMsFor", () => {
  it("is 6pm Toronto the day before, in winter", () => {
    // delivery Fri 2026-01-16 → cutoff Thu 2026-01-15 18:00 EST (-05:00)
    const ms = cutoffMsFor("2026-01-16", 18, TZ);
    expect(ms).toBe(Date.UTC(2026, 0, 15, 23, 0)); // 18:00 -05:00 = 23:00 UTC
  });
  it("is 6pm Toronto the day before, in summer (DST shifts by an hour)", () => {
    // delivery Fri 2026-07-17 → cutoff Thu 2026-07-16 18:00 EDT (-04:00) = 22:00 UTC
    const ms = cutoffMsFor("2026-07-17", 18, TZ);
    expect(ms).toBe(Date.UTC(2026, 6, 16, 22, 0));
  });
  it("honors a different cutoff hour", () => {
    expect(cutoffMsFor("2026-01-16", 20, TZ)).toBe(Date.UTC(2026, 0, 16, 1, 0)); // 20:00 -05:00
  });
});
