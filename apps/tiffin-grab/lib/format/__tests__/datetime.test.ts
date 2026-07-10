import { describe, expect, it } from "vitest";
import { epochToDate, formatDateOnly, formatDeliveryTime, formatEpoch } from "../datetime";

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

describe("formatDateOnly", () => {
  // A `date` column is a calendar fact with no instant. Its rendering must not depend on the
  // process timezone — this suite is run under two zones on opposite sides of the date line.
  it("renders the calendar date it was given", () => {
    expect(formatDateOnly("2026-07-16", { locale: "en-US" })).toBe("Jul 16, 2026");
  });

  it("short mode drops the year", () => {
    expect(formatDateOnly("2026-07-16", { mode: "short", locale: "en-US" })).toBe("Jul 16");
  });

  it("weekday mode names the day", () => {
    expect(formatDateOnly("2026-07-16", { mode: "weekday", locale: "en-US" })).toBe("Thu, Jul 16, 2026");
  });

  it("does not shift across a month boundary", () => {
    expect(formatDateOnly("2026-08-01", { mode: "short", locale: "en-US" })).toBe("Aug 1");
    expect(formatDateOnly("2026-07-31", { mode: "short", locale: "en-US" })).toBe("Jul 31");
  });
});
