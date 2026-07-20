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
    expect(selectedDaySummaryMessage({ dateIso: "2026-07-20", cell: undefined, delivery: undefined })).toBe(
      "There are no orders scheduled for this day",
    );
  });

  it("returns menu-not-published when a delivery exists without a cell", () => {
    expect(
      selectedDaySummaryMessage({ dateIso: "2026-08-03", cell: undefined, delivery: { meal: { pending: true } } }),
    ).toBe("Menu for Aug 3 – Aug 9 isn't published yet");
  });

  it("returns menu-not-released when the cell has no options yet", () => {
    expect(
      selectedDaySummaryMessage({ dateIso: "2026-07-20", cell: makeCell({ options: [] }), delivery: { meal: { pending: true } } }),
    ).toBe("Menu for Jul 20 – Jul 26 isn't released yet");
  });
});
