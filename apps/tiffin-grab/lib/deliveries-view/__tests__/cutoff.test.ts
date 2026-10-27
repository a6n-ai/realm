import { describe, expect, it } from "vitest";
import { formatCountdown, nextCutoff } from "../cutoff";

const TZ = "America/Toronto"; // UTC-4 in July

describe("nextCutoff", () => {
  it("counts to today's cutoff before it passes", () => {
    const now = Date.parse("2026-07-14T14:30:00Z"); // 10:30 local
    expect(nextCutoff(now, 18, TZ)).toEqual({ ms: 7.5 * 3600_000, today: true });
  });

  it("rolls to tomorrow once today's cutoff has passed", () => {
    const now = Date.parse("2026-07-14T23:00:00Z"); // 19:00 local
    expect(nextCutoff(now, 18, TZ)).toEqual({ ms: 23 * 3600_000, today: false });
  });

  it("treats the cutoff minute itself as passed", () => {
    const now = Date.parse("2026-07-14T22:00:00Z"); // 18:00 local
    expect(nextCutoff(now, 18, TZ).today).toBe(false);
  });
});

describe("formatCountdown", () => {
  it("ticks h:mm:ss, then m:ss under an hour", () => {
    expect(formatCountdown(3 * 3600_000 + 2 * 60_000 + 9_000)).toBe("3h 02m");
    expect(formatCountdown(42 * 60_000 + 5_000)).toBe("42m");
    expect(formatCountdown(30_000)).toBe("<1m");
    expect(formatCountdown(-1)).toBe("<1m");
  });
});
