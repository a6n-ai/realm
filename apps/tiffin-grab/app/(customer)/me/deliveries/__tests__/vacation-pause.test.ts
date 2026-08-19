import { describe, expect, it } from "vitest";
import {
  buildVacationPauseRequest,
  validateVacationDates,
  vacationRequiresEndDate,
  vacationSummaryMessage,
} from "../vacation-pause";

describe("vacation-pause", () => {
  it("start only sends an indefinite pause from that date", () => {
    expect(buildVacationPauseRequest("2026-08-01", "")).toEqual({
      from: "2026-08-01",
      until: "2026-08-01",
      indefinite: true,
    });
  });

  it("start and end send a bounded pause window", () => {
    expect(buildVacationPauseRequest("2026-08-01", "2026-08-10")).toEqual({
      from: "2026-08-01",
      until: "2026-08-10",
    });
  });

  it("requires end date when the plan caps pause stretch", () => {
    expect(vacationRequiresEndDate(7)).toBe(true);
    expect(vacationRequiresEndDate(null)).toBe(false);
  });

  it("summarizes open-ended vs bounded vacations", () => {
    expect(vacationSummaryMessage("2026-08-01", "")).toMatch(/until you resume/i);
    expect(vacationSummaryMessage("2026-08-01", "2026-08-10")).toMatch(/date range/i);
  });

  it("allows a vacation that starts today", () => {
    expect(
      validateVacationDates({
        from: "2026-08-19",
        until: "2026-08-19",
        indefinite: true,
        today: "2026-08-19",
        endDateRequired: false,
        endDate: "",
      }),
    ).toBeNull();
  });

  it("rejects a start date before today", () => {
    expect(
      validateVacationDates({
        from: "2026-08-18",
        until: "2026-08-20",
        indefinite: false,
        today: "2026-08-19",
        endDateRequired: false,
        endDate: "2026-08-20",
      }),
    ).toMatch(/past/i);
  });
});
