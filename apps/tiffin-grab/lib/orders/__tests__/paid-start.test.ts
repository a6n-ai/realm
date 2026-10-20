import { describe, expect, it } from "vitest";
import { paidStartDate } from "../paid-start";

// 2030-01-07 is a Monday
const today = new Date(Date.UTC(2030, 0, 7));
const allowed = ["mon", "tue", "wed", "thu", "fri"];
const base = { allowedStartDays: allowed, trialSendDays: null, todayBase: today, closed: new Set<string>() };

describe("paidStartDate", () => {
  it("keeps a chosen date that is still valid", () => {
    expect(paidStartDate({ ...base, chosen: "2030-01-09" })).toBe("2030-01-09");
  });
  it("moves a past date to the next allowed weekday", () => {
    expect(paidStartDate({ ...base, chosen: "2030-01-02" })).toBe("2030-01-08");
  });
  it("skips a holiday", () => {
    expect(paidStartDate({ ...base, chosen: "2030-01-02", closed: new Set(["2030-01-08"]) })).toBe("2030-01-09");
  });
  it("moves a chosen date that became a holiday to the next day, never earlier", () => {
    expect(paidStartDate({ ...base, chosen: "2030-01-09", closed: new Set(["2030-01-09"]) })).toBe("2030-01-10");
  });
  it("moves a trial to its next send day", () => {
    expect(paidStartDate({ ...base, chosen: "2030-01-02", trialSendDays: ["mon", "wed"] })).toBe("2030-01-09");
  });
});
