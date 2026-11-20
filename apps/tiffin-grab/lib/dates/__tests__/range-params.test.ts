import { describe, expect, it } from "vitest";
import { DATE_PRESETS } from "@/lib/analytics/date-presets";
import { presetRange } from "@/lib/analytics/date-presets";
import { currentMonthEpochRange, zonedRangeMs } from "@/lib/dates/epoch-window";
import { dateQs, hrefWithDates, parseRangeParams, rangeParams } from "@/lib/dates/range-params";

const TZ = "America/Toronto";
const now = Date.parse("2026-11-20T16:00:00Z");

describe("parseRangeParams", () => {
  it.each(DATE_PRESETS.map((p) => p.key))("range=%s resolves to the preset window", (key) => {
    expect(parseRangeParams({ range: key }, TZ, now)).toEqual({ preset: key, ...presetRange(key, TZ, now) });
  });

  it("ISO custom range is the inclusive zoned day window", () => {
    expect(parseRangeParams({ from: "2026-11-01", to: "2026-11-30" }, TZ, now)).toEqual(
      zonedRangeMs("2026-11-01", "2026-11-30", TZ),
    );
  });

  it("DST spring-forward and fall-back days keep their real length", () => {
    const spring = parseRangeParams({ from: "2026-03-08", to: "2026-03-08" }, TZ, now);
    expect(spring.to! - spring.from! + 1).toBe(23 * 3600_000);
    const fall = parseRangeParams({ from: "2026-11-01", to: "2026-11-01" }, TZ, now);
    expect(fall.to! - fall.from! + 1).toBe(25 * 3600_000);
  });

  it("month end covers the whole last day", () => {
    const r = parseRangeParams({ from: "2026-02-01", to: "2026-02-28" }, TZ, now);
    expect(r.to).toBe(Date.parse("2026-03-01T05:00:00Z") - 1);
  });

  it("legacy epoch ms parses to the same numbers", () => {
    expect(parseRangeParams({ from: "1761969600000", to: "1764561599999" }, TZ, now)).toEqual({
      from: 1761969600000,
      to: 1764561599999,
    });
  });

  it("an open end stays open", () => {
    expect(parseRangeParams({ from: "2026-11-05" }, TZ, now)).toEqual({ from: zonedRangeMs("2026-11-05", "2026-11-05", TZ).from });
  });

  it("garbage is ignored", () => {
    expect(parseRangeParams({ from: "abc", to: "2026-13-45", range: "yesterday" }, TZ, now)).toEqual({});
    expect(parseRangeParams({ from: "2026-02-30" }, TZ, now)).toEqual({});
  });

  it("swaps a reversed pair like epochRange", () => {
    const a = zonedRangeMs("2026-11-01", "2026-11-30", TZ);
    expect(parseRangeParams({ from: "2026-11-30", to: "2026-11-01" }, TZ, now)).toEqual(a);
    expect(parseRangeParams({ from: "200", to: "100" }, TZ, now)).toEqual({});
    expect(parseRangeParams({ from: "1764561599999", to: "1761969600000" }, TZ, now)).toEqual({
      from: 1761969600000,
      to: 1764561599999,
    });
  });

  it("range wins over from/to; dates=all is reported", () => {
    expect(parseRangeParams({ range: "last-7", from: "2026-01-01" }, TZ, now).preset).toBe("last-7");
    expect(parseRangeParams({ dates: "all" }, TZ, now)).toEqual({ all: true });
  });
});

describe("rangeParams", () => {
  it("the default month writes nothing", () => {
    expect(rangeParams(currentMonthEpochRange(TZ, now), TZ, now)).toEqual({});
    expect(rangeParams({ preset: "this-month" }, TZ, now)).toEqual({});
  });

  it("a preset writes its key", () => {
    expect(rangeParams({ preset: "last-7" }, TZ, now)).toEqual({ range: "last-7" });
    expect(rangeParams(presetRange("last-30", TZ, now), TZ, now)).toEqual({ range: "last-30" });
  });

  it("a custom day window writes ISO dates that parse back to the same epochs", () => {
    const w = zonedRangeMs("2026-03-01", "2026-03-31", TZ);
    const p = rangeParams(w, TZ, now);
    expect(p).toEqual({ from: "2026-03-01", to: "2026-03-31" });
    expect(parseRangeParams(p, TZ, now)).toEqual(w);
  });

  it("a window that is not on day edges keeps exact epochs", () => {
    const w = { from: 1761969600123, to: 1764561599999 };
    const p = rangeParams(w, TZ, now);
    expect(p).toEqual({ from: "1761969600123", to: "1764561599999" });
    expect(parseRangeParams(p, TZ, now)).toEqual(w);
  });
});

describe("hrefWithDates", () => {
  it("writes the page window in URL form, or epoch for a hand-built window", () => {
    expect(hrefWithDates("/x", { dateQs: dateQs({ range: "last-7" }) }, { a: "1" })).toBe("/x?range=last-7&a=1");
    expect(hrefWithDates("/x", { dateQs: "" })).toBe("/x");
    expect(hrefWithDates("/x", { from: "1761969600000", to: "1764565199999" })).toBe("/x?from=1761969600000&to=1764565199999");
  });
});

describe("rangeParams exact", () => {
  it("keeps a window equal to a preset or the month as ISO instead of collapsing", () => {
    expect(rangeParams(presetRange("last-7", TZ, now), TZ, now, { exact: true })).toEqual({ from: "2026-11-14", to: "2026-11-20" });
    expect(rangeParams(currentMonthEpochRange(TZ, now), TZ, now, { exact: true })).toEqual({ from: "2026-11-01", to: "2026-11-30" });
  });
});

describe("parseRangeParams hostile epochs", () => {
  it.each(["1".repeat(17), "9".repeat(400), "8640000000000001"])("ignores %s", (v) => {
    expect(parseRangeParams({ from: v, to: v }, TZ, now)).toEqual({});
    expect(parseRangeParams({ from: v }, TZ, now)).toEqual({});
  });
  it("keeps the last epoch of year 9999 and rejects the next", () => {
    expect(parseRangeParams({ from: "253402300799999" }, TZ, now)).toEqual({ from: 253402300799999 });
    expect(parseRangeParams({ from: "253402300800000" }, TZ, now)).toEqual({});
  });
});
