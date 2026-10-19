import { describe, expect, it } from "vitest";
import { expandPattern, type RepeatPattern } from "../pattern";

const base: RepeatPattern = {
  weekdays: [1, 2, 4, 5],
  nthOfMonth: null,
  startClock: "10:00",
  endClock: "11:00",
  startsOn: "2026-01-01",
  endsOn: null,
  excludeMonths: [],
};

describe("expandPattern", () => {
  it("lists the chosen weekdays", () => {
    expect(expandPattern(base, "2026-10-19", "2026-10-25")).toEqual([
      "2026-10-19",
      "2026-10-20",
      "2026-10-22",
      "2026-10-23",
    ]);
  });

  it("applies nth-of-month and excluded months", () => {
    const p = { ...base, weekdays: [3], nthOfMonth: [1, 3], excludeMonths: [6, 12] };
    expect(expandPattern(p, "2026-11-01", "2026-12-31")).toEqual(["2026-11-04", "2026-11-18"]);
  });

  it("truncates at endsOn and starts no earlier than startsOn", () => {
    const p = { ...base, startsOn: "2026-10-20", endsOn: "2026-10-22" };
    expect(expandPattern(p, "2026-10-19", "2026-10-25")).toEqual(["2026-10-20", "2026-10-22"]);
  });
});
