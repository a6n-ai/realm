import { describe, expect, it } from "vitest";
import { epochToDate, formatEpoch } from "../datetime";

const ms = Date.UTC(2026, 5, 22, 18, 30, 0); // 2026-06-22T18:30:00Z

describe("formatEpoch", () => {
  it("formats a fixed timeZone deterministically (datetime)", () => {
    const s = formatEpoch(ms, { timeZone: "America/Toronto", mode: "datetime" });
    expect(s).toContain("2026");
    expect(s).toMatch(/2:30|14:30/); // 18:30Z = 14:30 EDT
  });

  it("renders the same instant differently across zones", () => {
    const tor = formatEpoch(ms, { timeZone: "America/Toronto", mode: "time" });
    const kol = formatEpoch(ms, { timeZone: "Asia/Kolkata", mode: "time" });
    expect(tor).not.toEqual(kol);
  });

  it("epochToDate round-trips the instant", () => {
    expect(epochToDate(ms).getTime()).toBe(ms);
  });
});
