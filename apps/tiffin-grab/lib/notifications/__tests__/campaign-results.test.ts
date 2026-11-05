import { describe, expect, it } from "vitest";
import { mergeCounts, sumMetricResults } from "../campaign-results";

describe("campaign results from CloudWatch", () => {
  it("sums daily datapoints per metric and ignores unknown ids", () => {
    expect(
      sumMetricResults([
        { Id: "delivered", Values: [9000, 300] },
        { Id: "opened", Values: [1200, 400, 5] },
        { Id: "clicked", Values: [] },
        { Id: "other", Values: [1] },
      ]),
    ).toEqual({ delivered: 9300, opened: 1605, clicked: 0 });
  });

  it("never lowers a count the old webhook recorded, and keeps other keys", () => {
    expect(mergeCounts({ queued: 9325, delivered: 120, bounced: 4 }, { delivered: 80, opened: 30 })).toEqual({
      queued: 9325,
      delivered: 120,
      bounced: 4,
      opened: 30,
    });
  });
});
