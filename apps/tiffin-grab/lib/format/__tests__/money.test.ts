import { describe, it, expect } from "vitest";
import { formatMoney } from "../money";

describe("formatMoney", () => {
  it("formats INR with Indian grouping", () => {
    expect(formatMoney(450000, "INR")).toBe("₹4,50,000.00");
  });
  it("formats CAD without a country prefix", () => {
    expect(formatMoney(12.99, "CAD")).toBe("$12.99");
  });
  it("rounds to whole units", () => {
    expect(formatMoney(1234.5, "CAD", { whole: true })).toBe("$1,235");
  });
  it("uses the narrow symbol", () => {
    expect(formatMoney(5, "USD", { narrow: true })).toBe("$5.00");
  });
});
