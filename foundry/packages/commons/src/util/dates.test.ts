import { describe, expect, it } from "vitest";
import { isWeekend, nextWeekday, parseIsoDateUtc, weekdayKey } from "./dates";

const d = (iso: string) => parseIsoDateUtc(iso);

describe("weekdayKey", () => {
  it("maps known dates to weekday keys", () => {
    expect(weekdayKey(d("2026-06-22"))).toBe("mon"); // a Monday
    expect(weekdayKey(d("2026-06-26"))).toBe("fri");
    expect(weekdayKey(d("2026-06-27"))).toBe("sat");
    expect(weekdayKey(d("2026-06-28"))).toBe("sun");
  });
});

describe("isWeekend", () => {
  it("is true for Sat/Sun only", () => {
    expect(isWeekend(d("2026-06-27"))).toBe(true);
    expect(isWeekend(d("2026-06-28"))).toBe(true);
    expect(isWeekend(d("2026-06-26"))).toBe(false);
  });
});

describe("nextWeekday", () => {
  it("returns the next day when that day is a weekday", () => {
    expect(weekdayKey(nextWeekday(d("2026-06-22")))).toBe("tue"); // Mon -> Tue
  });
  it("skips the weekend from Friday", () => {
    const r = nextWeekday(d("2026-06-26")); // Fri -> Mon
    expect(weekdayKey(r)).toBe("mon");
    expect(r.getUTCDate()).toBe(29);
  });
  it("skips the weekend from Saturday and Sunday", () => {
    expect(weekdayKey(nextWeekday(d("2026-06-27")))).toBe("mon");
    expect(weekdayKey(nextWeekday(d("2026-06-28")))).toBe("mon");
  });
});

describe("parseIsoDateUtc", () => {
  it("throws on malformed input", () => {
    expect(() => parseIsoDateUtc("2026/06/22")).toThrow();
    expect(() => parseIsoDateUtc("nope")).toThrow();
  });
  it("throws on out-of-range calendar values (no silent wrap)", () => {
    expect(() => parseIsoDateUtc("2026-02-30")).toThrow();
    expect(() => parseIsoDateUtc("2026-13-01")).toThrow();
    expect(() => parseIsoDateUtc("2026-00-10")).toThrow();
  });
});
