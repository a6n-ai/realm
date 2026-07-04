import { describe, expect, it } from "vitest";
import { pageRange } from "@realm/design-system";

describe("pageRange", () => {
  it("returns all pages when few", () => {
    expect(pageRange(1, 3)).toEqual([1, 2, 3]);
  });
  it("windows around the current page when many", () => {
    expect(pageRange(5, 20)).toEqual([4, 5, 6]);
  });
  it("clamps at the start", () => {
    expect(pageRange(1, 20)).toEqual([1, 2, 3]);
  });
  it("clamps at the end", () => {
    expect(pageRange(20, 20)).toEqual([18, 19, 20]);
  });
  it("handles a single page", () => {
    expect(pageRange(1, 1)).toEqual([1]);
  });
});
