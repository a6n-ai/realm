import { describe, expect, it } from "vitest";
import { roundedCount } from "../kitchen-counts";

describe("roundedCount", () => {
  it("rounds down so the figure never overstates", () => {
    expect(roundedCount(4789)).toBe("4,700+");
    expect(roundedCount(385)).toBe("380+");
    expect(roundedCount(42)).toBe("42");
    expect(roundedCount(1000)).toBe("1,000+");
  });
});
