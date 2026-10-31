import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/deliveries-view/week";
import { delta } from "../delta";
import { buildKitchenWeek } from "../kitchen-week";

describe("delta", () => {
  it("relative percent, good up", () => expect(delta(106, 100)).toEqual({ text: "+6%", tone: "ok", word: "Above" }));
  it("down is bad unless good=down", () => {
    expect(delta(90, 100).tone).toBe("bad");
    expect(delta(90, 100, { good: "down" }).tone).toBe("ok");
  });
  it("points for rates", () => expect(delta(66, 68, { points: true }).text).toBe("−2 pts"));
  it("flat", () => expect(delta(5, 5).tone).toBe("flat"));
});

describe("buildKitchenWeek", () => {
  it("buckets by day, splits last week, drops empty sizes", () => {
    const rows = buildKitchenWeek(
      [
        { mealSize: "A", date: "2026-10-26", units: 3 },
        { mealSize: "A", date: "2026-11-01", units: 2 },
        { mealSize: "A", date: "2026-10-20", units: 4 },
        { mealSize: "B", date: "2026-11-09", units: 9 },
      ],
      "2026-10-26",
      addDays,
    );
    expect(rows).toEqual([{ mealSize: "A", days: [3, 0, 0, 0, 0, 0, 2], total: 5, prevTotal: 4 }]);
  });
});
