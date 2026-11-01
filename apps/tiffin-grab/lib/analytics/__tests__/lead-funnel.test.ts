import { describe, expect, it } from "vitest";
import { LEAD_PIPELINE, reachedStages } from "../lead-funnel";

describe("reachedStages", () => {
  it("uses the four-step pipeline", () => {
    expect(LEAD_PIPELINE).toEqual(["new", "contacted", "follow_up", "converted"]);
  });

  it("counts a lead at every stage up to its current one, so steps never grow", () => {
    // prod October 2026: 100 converted, 20 new, nothing in between
    expect(reachedStages({ new: 20, converted: 100 }).map((s) => s.reached)).toEqual([120, 100, 100, 100]);
  });

  it("counts legacy quoted leads as follow_up", () => {
    const got = reachedStages({ new: 5, contacted: 3, quoted: 2, follow_up: 4, converted: 1, lost: 2 });
    expect(got.map((s) => [s.key, s.reached])).toEqual([
      ["new", 17],
      ["contacted", 10],
      ["follow_up", 7],
      ["converted", 1],
    ]);
  });

  it("puts lost leads in the first step only", () => {
    expect(reachedStages({ new: 1, contacted: 2, quoted: 3, follow_up: 4, converted: 5, lost: 6 }).map((s) => s.reached)).toEqual([21, 14, 12, 5]);
  });

  it("is all zero with no leads", () => {
    expect(reachedStages({}).every((s) => s.reached === 0)).toBe(true);
  });
});
