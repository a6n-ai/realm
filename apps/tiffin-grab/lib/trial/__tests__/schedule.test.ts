import { describe, expect, it } from "vitest";
import { ValidationError } from "@foundry/commons";
import { durationWeeksCovering, trialDeliveryDates } from "../schedule";

describe("trialDeliveryDates", () => {
  it("takes the next matching weekdays until the chosen length is filled", () => {
    expect(trialDeliveryDates("2026-09-30", 2, ["mon", "wed", "fri"])).toEqual(["2026-09-30", "2026-10-02"]);
    expect(trialDeliveryDates("2026-09-30", 3, ["mon", "wed", "fri"])).toEqual(["2026-09-30", "2026-10-02", "2026-10-05"]);
    expect(trialDeliveryDates("2026-09-28", 5, ["mon", "tue", "wed", "thu", "fri"])).toEqual([
      "2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02",
    ]);
  });

  it("refuses a start day that is not a send day", () => {
    expect(() => trialDeliveryDates("2026-09-29", 1, ["mon", "wed", "fri"])).toThrow(ValidationError);
  });
});

describe("durationWeeksCovering", () => {
  it("covers the last delivery inside the overlap window", () => {
    expect(durationWeeksCovering("2026-09-30", "2026-10-05")).toBe(1);
    expect(durationWeeksCovering("2026-09-28", "2026-10-02")).toBe(1);
    expect(durationWeeksCovering("2026-09-28", "2026-10-12")).toBe(3);
  });
});
