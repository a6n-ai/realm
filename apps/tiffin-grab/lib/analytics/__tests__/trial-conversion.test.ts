import { describe, expect, it } from "vitest";
import { isoDateInZone } from "../profitability";
import {
  conversionDeadline,
  summarizeTrialConversion,
  TRIAL_CONVERT_WINDOW_DAYS,
} from "../trial-conversion";

const TZ = "America/Toronto";

describe("conversionDeadline", () => {
  it("adds the window in calendar days", () => {
    expect(conversionDeadline("2035-03-10", 14)).toBe("2035-03-24");
  });
});

describe("summarizeTrialConversion", () => {
  it("counts a paid plan created within the window after trial end", () => {
    const trialCreated = Date.parse("2035-03-01T15:00:00Z");
    const planCreated = Date.parse("2035-03-20T15:00:00Z"); // end 03-10 + 14 = 03-24
    const stats = summarizeTrialConversion({
      timezone: TZ,
      isoDateInZone,
      trials: [{ orderId: "t1", userId: "u1", trialCreatedAt: trialCreated, endDate: "2035-03-10" }],
      paidPlans: [{ userId: "u1", createdAt: planCreated }],
    });
    expect(stats.eligible).toBe(1);
    expect(stats.converted).toBe(1);
    expect(stats.conversionRatePct).toBe(100);
    expect(stats.windowDays).toBe(TRIAL_CONVERT_WINDOW_DAYS);
  });

  it("ignores plans after the deadline and plans before the trial", () => {
    const trialCreated = Date.parse("2035-03-05T15:00:00Z");
    const tooLate = Date.parse("2035-03-26T15:00:00Z"); // after 03-24
    const beforeTrial = Date.parse("2035-03-01T15:00:00Z");
    const stats = summarizeTrialConversion({
      timezone: TZ,
      isoDateInZone,
      trials: [{ orderId: "t1", userId: "u1", trialCreatedAt: trialCreated, endDate: "2035-03-10" }],
      paidPlans: [
        { userId: "u1", createdAt: tooLate },
        { userId: "u1", createdAt: beforeTrial },
        { userId: "u2", createdAt: Date.parse("2035-03-12T15:00:00Z") },
      ],
    });
    expect(stats.converted).toBe(0);
    expect(stats.conversionRatePct).toBe(0);
  });

  it("returns null rate when nothing is eligible", () => {
    const stats = summarizeTrialConversion({
      timezone: TZ,
      isoDateInZone,
      trials: [],
      paidPlans: [],
    });
    expect(stats.conversionRatePct).toBeNull();
  });
});
