import { describe, expect, it } from "vitest";
import { activePreset, DATE_PRESETS, presetRange } from "../date-presets";
import { zonedDayStart } from "../drill";

const TZ = "America/Toronto";

describe("presetRange", () => {
  it("last month at 00:30 on the 1st is the previous calendar month, not the one just started", () => {
    const now = zonedDayStart("2026-11-01", TZ) + 30 * 60_000;
    expect(presetRange("last-month", TZ, now)).toEqual({
      from: zonedDayStart("2026-10-01", TZ),
      to: zonedDayStart("2026-11-01", TZ) - 1,
    });
    expect(presetRange("this-month", TZ, now).from).toBe(zonedDayStart("2026-11-01", TZ));
  });

  it("uses wall-day bounds across the fall-back DST change (25-hour day, Nov 1 2026)", () => {
    const now = zonedDayStart("2026-11-10", TZ) + 3_600_000;
    const r = presetRange("last-30", TZ, now);
    expect(r.from).toBe(zonedDayStart("2026-10-12", TZ));
    expect(r.to).toBe(zonedDayStart("2026-11-11", TZ) - 1);
    const oct = presetRange("last-month", TZ, zonedDayStart("2026-11-15", TZ));
    expect(oct.to - oct.from + 1).toBe(31 * 86_400_000); // Oct has no DST shift
    const nov = presetRange("this-month", TZ, zonedDayStart("2026-11-15", TZ));
    expect(nov.to - nov.from + 1).toBe(30 * 86_400_000 + 3_600_000); // 25-hour Nov 1
  });

  it("last 7 days is today and the 6 days before, crossing a month boundary", () => {
    const now = zonedDayStart("2026-11-03", TZ) + 5 * 3_600_000;
    const r = presetRange("last-7", TZ, now);
    expect(r.from).toBe(zonedDayStart("2026-10-28", TZ));
    expect(r.to).toBe(zonedDayStart("2026-11-04", TZ) - 1);
  });

  it("highlights exactly the matching preset and none for a custom range", () => {
    const now = Date.parse("2026-10-20T15:00:00Z");
    for (const p of DATE_PRESETS) {
      expect(activePreset(presetRange(p.key, TZ, now), TZ, now)).toBe(p.key);
    }
    const r = presetRange("this-month", TZ, now);
    expect(activePreset({ from: r.from + 1, to: r.to }, TZ, now)).toBeNull();
  });
});
