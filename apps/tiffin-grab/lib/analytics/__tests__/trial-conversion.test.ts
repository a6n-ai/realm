import { describe, expect, it } from "vitest";
import { conversionDeadline, summarizeTrialConversion, TRIAL_CONVERT_WINDOW_DAYS } from "../trial-conversion";

describe("conversionDeadline", () => {
  it("adds the window in calendar days", () => {
    expect(conversionDeadline("2035-03-10", 14)).toBe("2035-03-24");
  });
});

describe("summarizeTrialConversion", () => {
  it("counts closed-window trials and their conversions", () => {
    const stats = summarizeTrialConversion({
      todayIso: "2035-04-01",
      trials: [
        { orderId: "a", endDate: "2035-03-10", converted: true },
        { orderId: "b", endDate: "2035-03-10", converted: false },
      ],
    });
    expect(stats).toMatchObject({ eligible: 2, converted: 1, open: 0, conversionRatePct: 50 });
    expect(stats.windowDays).toBe(TRIAL_CONVERT_WINDOW_DAYS);
  });

  it("keeps trials inside their window out of the rate and reports them as open", () => {
    const stats = summarizeTrialConversion({
      todayIso: "2035-03-24",
      trials: [
        { orderId: "closed-today", endDate: "2035-03-10", converted: false }, // 03-10 + 14 = 03-24 <= today
        { orderId: "open", endDate: "2035-03-11", converted: true }, // deadline 03-25 > today
      ],
    });
    expect(stats).toMatchObject({ eligible: 1, converted: 0, open: 1, conversionRatePct: 0 });
  });

  it("returns a null rate when nothing is eligible", () => {
    const stats = summarizeTrialConversion({
      todayIso: "2035-03-12",
      trials: [{ orderId: "x", endDate: "2035-03-11", converted: true }],
    });
    expect(stats).toMatchObject({ eligible: 0, open: 1, conversionRatePct: null });
  });
});
