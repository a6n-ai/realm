import { describe, expect, it } from "vitest";
import { dayTypeOf, offeredLengths, resolveCell, startTimes } from "../resolve";
import type { ClassPricing, PriceTable } from "../types";

const global: PriceTable = {
  "len:90": { weekday: 68, weekend: 78 },
  "len:120": { weekday: 88, weekend: 98 },
  "len:180": { weekday: 128, weekend: 138 },
  "len:240": { weekday: 158, weekend: 168 },
};

describe("pricing resolve", () => {
  it("dayTypeOf: Fri/Sat/Sun weekend", () => {
    expect(dayTypeOf("2026-10-23")).toBe("weekend");
    expect(dayTypeOf("2026-10-22")).toBe("weekday");
    expect(dayTypeOf("2026-10-24")).toBe("weekend");
    expect(dayTypeOf("2026-10-25")).toBe("weekend");
    expect(dayTypeOf("2026-10-26")).toBe("weekday");
  });

  it("falls through per cell", () => {
    expect(resolveCell("len:90", "weekday", [{ "len:90": { weekend: 80 } }, null, global])).toBe(68);
    expect(resolveCell("len:90", "weekend", [{ "len:90": { weekend: 80 } }, null, global])).toBe(80);
    expect(resolveCell("len:30", "weekday", [global])).toBeNull();
  });

  it("offeredLengths caps at window", () => {
    const p: ClassPricing = { mode: "length", defaultLengthMinutes: 90, options: [], extension: null, adults: { free: 0, extraPrice: null } };
    expect(offeredLengths(p, global, 180)).toEqual([90, 120, 180]);
  });

  it("offeredLengths in options mode uses option lengths", () => {
    const p: ClassPricing = {
      mode: "options",
      defaultLengthMinutes: 90,
      options: [
        { key: "a", label: "A", lengthMinutes: 120, adultsIncluded: 0 },
        { key: "b", label: "B", lengthMinutes: 60, adultsIncluded: 0 },
        { key: "c", label: "C", lengthMinutes: 240, adultsIncluded: 0 },
      ],
      extension: null,
      adults: { free: 0, extraPrice: null },
    };
    expect(offeredLengths(p, global, 180)).toEqual([60, 120]);
  });

  it("startTimes stops when shortest length no longer fits", () => {
    const s = new Date("2026-10-19T01:00:00Z");
    const e = new Date("2026-10-19T04:00:00Z");
    expect(startTimes(s, e, 90).map((d) => d.toISOString().slice(11, 16))).toEqual(["01:00", "01:30", "02:00", "02:30"]);
  });
});
