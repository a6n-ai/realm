import { describe, expect, it } from "vitest";
import { currencySymbol, formatDiscount } from "../currency";

describe("formatDiscount", () => {
  it("formats CAD like the old inline strings", () => {
    expect(formatDiscount({ valuePct: "20.00" }, "CAD")).toBe("20% off");
    expect(formatDiscount({ valueAmount: "5.00" }, "CAD")).toBe("$5 off");
    expect(formatDiscount({ valueAmount: 2.5 }, "CAD")).toBe("$2.50 off");
  });
  it("follows the currency", () => {
    expect(formatDiscount({ valueAmount: 5 }, "INR")).toContain("₹5");
    expect(currencySymbol("CAD")).toBe("$");
  });
});
