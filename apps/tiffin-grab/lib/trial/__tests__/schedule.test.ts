import { describe, expect, it } from "vitest";
import { ValidationError } from "@foundry/commons";
import { durationWeeksCovering, nextTrialStart, pickedTrialDays, toggleTrialPick, trialDeliveryDates, trialSendDays } from "../schedule";

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

describe("trialSendDays", () => {
  it("drops Sat/Sun for a trial meal without a weekend dish", () => {
    expect(trialSendDays(["sat", "mon", "sun", "fri"], false)).toEqual(["mon", "fri"]);
    expect(trialSendDays(["sat", "mon", "sun", "fri"], true)).toEqual(["mon", "fri", "sat", "sun"]);
  });
});

describe("pickedTrialDays", () => {
  it("keeps send days in week order, up to the max", () => {
    expect(pickedTrialDays(["fri", "mon"], ["mon", "wed", "fri"], 2)).toEqual(["mon", "fri"]);
  });

  it("refuses days outside the send days, duplicates, or too many", () => {
    expect(() => pickedTrialDays(["tue"], ["mon", "wed", "fri"], 3)).toThrow(ValidationError);
    expect(() => pickedTrialDays(["mon", "mon"], ["mon", "wed", "fri"], 3)).toThrow(ValidationError);
    expect(() => pickedTrialDays(["mon", "wed"], ["mon", "wed", "fri"], 1)).toThrow(ValidationError);
  });
});

describe("nextTrialStart", () => {
  it("finds the first picked weekday on or after the date", () => {
    expect(nextTrialStart("2026-09-30", ["wed"])).toBe("2026-09-30");
    expect(nextTrialStart("2026-09-30", ["mon"])).toBe("2026-10-05");
    expect(nextTrialStart("2026-09-30", [])).toBeNull();
  });
});

describe("toggleTrialPick", () => {
  const send = ["mon", "wed", "fri"];
  it("adds up to the max and keeps week order", () => {
    expect(toggleTrialPick(["fri"], "mon", send, 2)).toEqual(["mon", "fri"]);
    expect(toggleTrialPick(["mon", "fri"], "wed", send, 2)).toEqual(["mon", "fri"]);
  });
  it("never drops the last day or adds a non-send day", () => {
    expect(toggleTrialPick(["mon"], "mon", send, 2)).toEqual(["mon"]);
    expect(toggleTrialPick(["mon"], "tue", send, 2)).toEqual(["mon"]);
  });
});
