import { describe, expect, it } from "vitest";
import { formatMoney } from "./money";

describe("formatMoney", () => {
  it("formats CAD with grouping + 2 decimals", () => {
    expect(formatMoney(1234.5)).toContain("1,234.50");
  });
  it("respects a currency + locale override", () => {
    expect(formatMoney(10, "USD", "en-US")).toBe("$10.00");
  });
});
