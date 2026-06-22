import { describe, expect, it } from "vitest";
import { epochToDate, formatDeliveryTime, formatEpoch } from "../datetime";

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

describe("formatEpoch withZone", () => {
  it("appends a zone label when withZone is set", () => {
    const ms = Date.UTC(2026, 0, 15, 23, 0); // 6pm EST
    const s = formatEpoch(ms, { timeZone: "America/Toronto", mode: "datetime", withZone: true });
    expect(s).toMatch(/EST/);
  });
  it("omits the zone label by default", () => {
    const ms = Date.UTC(2026, 0, 15, 23, 0);
    const s = formatEpoch(ms, { timeZone: "America/Toronto", mode: "datetime" });
    expect(s).not.toMatch(/EST|EDT/);
  });
});

describe("formatDeliveryTime", () => {
  it("renders a labeled datetime in the given zone", () => {
    const ms = Date.UTC(2026, 6, 16, 22, 0); // 6pm EDT
    expect(formatDeliveryTime(ms, "America/Toronto")).toMatch(/EDT/);
  });
});
