import { describe, expect, it } from "vitest";
import { selectedDaySummaryMessage } from "../day-summary-message";
import type { CalendarCell } from "../calendar-constants";

function makeCell(overrides: Partial<CalendarCell> = {}): CalendarCell {
  return {
    date: "2026-07-20",
    status: "scheduled",
    locked: false,
    isMakeup: false,
    meal: null,
    options: [],
    menuWeekId: "week_1",
    ...overrides,
  } as CalendarCell;
}

describe("selectedDaySummaryMessage", () => {
  it("returns the off-day copy when there is no cell or delivery", () => {
    expect(selectedDaySummaryMessage({ cell: undefined, delivery: undefined })).toBe(
      "There are no orders scheduled for this day",
    );
  });

  it("returns menu-not-published when a delivery exists without a cell", () => {
    expect(
      selectedDaySummaryMessage({ cell: undefined, delivery: { meal: { pending: true } } }),
    ).toBe("Menu not published yet");
  });

  it("returns menu-not-released when the cell has no options yet", () => {
    expect(
      selectedDaySummaryMessage({ cell: makeCell({ options: [] }), delivery: { meal: { pending: true } } }),
    ).toBe("Menu not released yet");
  });
});
