import { describe, expect, it } from "vitest";
import { lastBoundary } from "../site-boundaries";

const TZ = "America/Toronto";

describe("lastBoundary", () => {
  it("returns Monday 00:00 America/Toronto just after midnight", () => {
    // 2026-11-09 is a Monday (EST, UTC-5)
    const now = Date.parse("2026-11-09T05:00:30Z");
    expect(lastBoundary(now, TZ, [])).toBe(Date.parse("2026-11-09T05:00:00Z"));
  });

  it("picks a promo end that is later than midnight", () => {
    const now = Date.parse("2026-11-09T15:00:00Z");
    const end = Date.parse("2026-11-09T12:00:00Z");
    expect(lastBoundary(now, TZ, [end])).toBe(end);
  });

  it("ignores future edges", () => {
    const now = Date.parse("2026-11-09T15:00:00Z");
    expect(lastBoundary(now, TZ, [now + 1000])).toBe(Date.parse("2026-11-09T05:00:00Z"));
  });

  it("handles the DST change day", () => {
    // 2026-11-01: clocks fall back at 02:00 EDT; midnight is still EDT (UTC-4)
    const now = Date.parse("2026-11-01T20:00:00Z");
    expect(lastBoundary(now, TZ, [])).toBe(Date.parse("2026-11-01T04:00:00Z"));
    // the next day's midnight is EST (UTC-5)
    expect(lastBoundary(Date.parse("2026-11-02T10:00:00Z"), TZ, [])).toBe(Date.parse("2026-11-02T05:00:00Z"));
  });
});
