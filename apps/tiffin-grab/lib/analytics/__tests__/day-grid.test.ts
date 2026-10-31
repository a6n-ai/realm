import { describe, expect, it } from "vitest";
import { dayGrid } from "../day-grid";

describe("dayGrid", () => {
  it("places every row in exactly one Mon–Sun cell and pads the gaps", () => {
    const rows = ["2026-10-28", "2026-10-31", "2026-11-03", "2026-10-26"].map((date) => ({ date }));
    const weeks = dayGrid(rows);
    expect(weeks).toHaveLength(2);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    const cells = weeks.flat().filter(Boolean);
    expect(cells).toHaveLength(rows.length);
    expect(new Set(cells.map((c) => c!.date))).toEqual(new Set(rows.map((r) => r.date)));
    expect(weeks[0]![0]!.date).toBe("2026-10-26");
    expect(weeks[1]![1]!.date).toBe("2026-11-03");
    expect(dayGrid([])).toEqual([]);
  });
});
