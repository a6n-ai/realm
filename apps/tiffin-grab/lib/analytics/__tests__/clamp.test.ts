import { describe, expect, it } from "vitest";
import { clampToToday } from "../clamp";

const TZ = "America/Toronto";
// 2026-10-15 12:00 Toronto
const NOW = Date.parse("2026-10-15T16:00:00Z");

describe("clampToToday", () => {
  it("ends a mid-month 'This month' range at today", () => {
    expect(clampToToday({ from: "2026-10-01", to: "2026-10-31" }, TZ, NOW)).toEqual({ from: "2026-10-01", to: "2026-10-15" });
  });
  it("leaves a range entirely in the past alone", () => {
    expect(clampToToday({ from: "2026-09-01", to: "2026-09-30" }, TZ, NOW)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
  });
  it("is empty for a range entirely in the future", () => {
    expect(clampToToday({ from: "2026-11-01", to: "2026-11-30" }, TZ, NOW)).toBeNull();
  });
  it("uses the app timezone's today, not UTC's", () => {
    // 2026-10-16 01:00Z is still Oct 15 in Toronto
    expect(clampToToday({ from: "2026-10-01", to: "2026-10-31" }, TZ, Date.parse("2026-10-16T01:00:00Z"))?.to).toBe("2026-10-15");
  });
});
