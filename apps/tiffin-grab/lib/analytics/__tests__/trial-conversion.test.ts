import { describe, expect, it } from "vitest";
import { conversionDeadline, earliestRelevantEnd, summarizeTrialConversion, TRIAL_CONVERT_WINDOW_DAYS } from "../trial-conversion";

describe("conversionDeadline", () => {
  it("adds the window in calendar days", () => {
    expect(conversionDeadline("2035-03-10", 14)).toBe("2035-03-24");
    expect(earliestRelevantEnd("2035-03-24", 14)).toBe("2035-03-10");
  });
});

// Range: March 2035.
const march = { fromIso: "2035-03-01", toIso: "2035-03-31" };

describe("summarizeTrialConversion", () => {
  it("dates a conversion by the plan booking, even when the trial ended the month before", () => {
    const stats = summarizeTrialConversion({
      ...march,
      todayIso: "2035-03-05",
      trials: [
        { orderId: "feb-trial", endDate: "2035-02-26", convertedOn: "2035-03-02" },
        { orderId: "booked-in-feb", endDate: "2035-02-26", convertedOn: "2035-02-27" },
      ],
    });
    expect(stats).toMatchObject({ eligible: 1, converted: 1, open: 0, conversionRatePct: 100 });
    expect(stats.windowDays).toBe(TRIAL_CONVERT_WINDOW_DAYS);
  });

  it("dates a loss by the window closing, and keeps undecided trials out of the rate", () => {
    const stats = summarizeTrialConversion({
      ...march,
      todayIso: "2035-03-24",
      trials: [
        { orderId: "lost-today", endDate: "2035-03-10", convertedOn: null }, // 03-10 + 14 = 03-24 <= today
        { orderId: "lost-from-feb", endDate: "2035-02-20", convertedOn: null }, // closed 03-06
        { orderId: "lost-in-feb", endDate: "2035-02-10", convertedOn: null }, // closed 02-24: not March
        { orderId: "open", endDate: "2035-03-11", convertedOn: null }, // deadline 03-25 > today
      ],
    });
    expect(stats).toMatchObject({ eligible: 2, converted: 0, open: 1, conversionRatePct: 0 });
  });

  it("returns a null rate when nothing is decided", () => {
    const stats = summarizeTrialConversion({
      ...march,
      todayIso: "2035-03-12",
      trials: [{ orderId: "x", endDate: "2035-03-11", convertedOn: null }],
    });
    expect(stats).toMatchObject({ eligible: 0, open: 1, conversionRatePct: null });
  });
});
