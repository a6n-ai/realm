import { describe, expect, it } from "vitest";
import {
  buildVacationPauseRequest,
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
});
