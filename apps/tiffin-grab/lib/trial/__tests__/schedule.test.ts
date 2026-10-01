import { describe, expect, it } from "vitest";
import { ValidationError } from "@foundry/commons";
import { assertTrialStart, durationWeeksCovering, nextTrialStart, resolveTrialDays, toggleTrialPick, trialDeliveryDates, trialSendDays } from "../schedule";

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

describe("resolveTrialDays", () => {
  const allowed = ["mon", "tue", "wed", "thu", "fri"] as const;

  it("picked weekdays decide the days and the count, in week order", () => {
    expect(resolveTrialDays([...allowed], 3, ["thu", "mon"], undefined)).toEqual({ sendDays: ["mon", "thu"], length: 2 });
  });

  it("picked days give one tiffin each from the start date", () => {
    const { sendDays, length } = resolveTrialDays([...allowed], 3, ["mon", "wed", "fri"], undefined);
    // 2026-10-05 is a Monday.
    expect(trialDeliveryDates("2026-10-05", length, sendDays)).toEqual(["2026-10-05", "2026-10-07", "2026-10-09"]);
  });

  it("rejects a day trials are not sent on, and more picks than the max", () => {
    expect(() => resolveTrialDays([...allowed], 3, ["sat"], undefined)).toThrow("Trials aren't sent on sat");
    expect(() => resolveTrialDays([...allowed], 2, ["mon", "tue", "wed"], undefined)).toThrow("Choose 1 to 2 days");
  });

  it("without picks keeps the count over every allowed day", () => {
    expect(resolveTrialDays([...allowed], 3, undefined, 2)).toEqual({ sendDays: [...allowed], length: 2 });
    expect(() => resolveTrialDays([...allowed], 3, [], 0)).toThrow(ValidationError);
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

describe("nextTrialStart", () => {
  it("finds the first picked weekday on or after the date", () => {
    expect(nextTrialStart("2026-09-30", ["wed"])).toBe("2026-09-30");
    expect(nextTrialStart("2026-09-30", ["mon"])).toBe("2026-10-05");
    expect(nextTrialStart("2026-09-30", [])).toBeNull();
  });
});

describe("assertTrialStart", () => {
  it("asks for a start date instead of crashing on an empty one", () => {
    expect(() => assertTrialStart("", ["mon"], new Date())).toThrow(ValidationError);
  });
});

describe("resolveTrialDays one-week cap", () => {
  it("never allows more days than send days or 5", () => {
    expect(() => resolveTrialDays(["mon", "wed", "fri"], 5, undefined, 4)).toThrow(ValidationError);
    expect(resolveTrialDays(["mon", "wed", "fri"], 5, undefined, 3).length).toBe(3);
    expect(() => resolveTrialDays(["mon", "tue", "wed", "thu", "fri", "sat"], 6, undefined, 6)).toThrow(ValidationError);
  });
});
