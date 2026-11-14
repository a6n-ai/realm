import { describe, expect, it, vi } from "vitest";
import { clampDays, MAX_DAYS_AHEAD, parseMode, syncDates } from "../sync";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

describe("syncDates", () => {
  it("starts at tomorrow — today's route is already planned and driving", () => {
    expect(syncDates("2026-08-02", 1)).toEqual(["2026-08-03"]);
    expect(syncDates("2026-08-02", 3)).toEqual(["2026-08-03", "2026-08-04", "2026-08-05"]);
  });

  it("crosses a month boundary", () => {
    expect(syncDates("2026-08-31", 2)).toEqual(["2026-09-01", "2026-09-02"]);
  });

  it("crosses a year boundary", () => {
    expect(syncDates("2026-12-31", 1)).toEqual(["2027-01-01"]);
  });
});

describe("clampDays", () => {
  it("defaults to tomorrow only", () => {
    expect(clampDays(null)).toBe(1);
    expect(clampDays("")).toBe(1);
    expect(clampDays("nonsense")).toBe(1);
  });

  it("bounds the horizon, so a typo cannot sync a year of dates", () => {
    expect(clampDays("7")).toBe(7);
    expect(clampDays("999")).toBe(MAX_DAYS_AHEAD);
    expect(clampDays("0")).toBe(1);
    expect(clampDays("-5")).toBe(1);
  });
});

describe("parseMode", () => {
  it("defaults to push — the safe direction", () => {
    expect(parseMode(null)).toBe("push");
    expect(parseMode("garbage")).toBe("push");
  });

  it("accepts the two other modes", () => {
    expect(parseMode("pull")).toBe("pull");
    expect(parseMode("both")).toBe("both");
  });

  // There is deliberately no "remove" mode: unattended deletion takes a stop off a
  // driver's route from data that may be mid-edit.
  it("has no removal mode", () => {
    expect(parseMode("remove")).toBe("push");
    expect(parseMode("delete")).toBe("push");
  });
});
