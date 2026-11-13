import { describe, expect, it } from "vitest";
import { earliestPlanStart, firstStartOnOrAfter } from "../start-date";

describe("firstStartOnOrAfter with closed days", () => {
  it("skips a closed day to the next allowed weekday", () => {
    expect(firstStartOnOrAfter("2030-02-04", ["mon", "wed"], new Set(["2030-02-04"]))).toBe("2030-02-06");
  });
  it("is unchanged with no closed days", () => {
    expect(firstStartOnOrAfter("2030-02-04", ["mon", "wed"])).toBe("2030-02-04");
  });
  it("never returns a closed day when every allowed day in the next two weeks is closed", () => {
    const closed = new Set(["2030-02-04", "2030-02-06", "2030-02-11", "2030-02-13", "2030-02-18"]);
    expect(firstStartOnOrAfter("2030-02-04", ["mon", "wed"], closed)).toBe("2030-02-20");
  });
});

describe("earliestPlanStart with closed days", () => {
  it("skips a holiday on the earliest start", () => {
    const thu = new Date("2026-10-08T00:00:00Z");
    expect(earliestPlanStart(thu, ["mon", "tue", "wed", "thu", "fri"], null, new Set(["2026-10-09"]))).toBe("2026-10-12");
  });
});
