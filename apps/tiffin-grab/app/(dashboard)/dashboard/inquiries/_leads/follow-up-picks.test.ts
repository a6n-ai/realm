import { describe, expect, it } from "vitest";
import { followUpAtDate, followUpPick } from "./follow-up-picks";

const TZ = "America/Toronto";
// 2026-11-01 23:30 EST (DST ended that morning, UTC-5)
const now = Date.parse("2026-11-02T04:30:00Z");

describe("followUpPick", () => {
  it("tomorrow is 10:00 local on the next calendar day", () => {
    expect(followUpPick("tomorrow", now, TZ)).toBe(Date.parse("2026-11-02T15:00:00Z"));
  });
  it("3d and 1w", () => {
    expect(followUpPick("3d", now, TZ)).toBe(Date.parse("2026-11-04T15:00:00Z"));
    expect(followUpPick("1w", now, TZ)).toBe(Date.parse("2026-11-08T15:00:00Z"));
  });
  it("picked date is 10:00 local", () => {
    expect(followUpAtDate("2026-11-10", TZ)).toBe(Date.parse("2026-11-10T15:00:00Z"));
  });
});
