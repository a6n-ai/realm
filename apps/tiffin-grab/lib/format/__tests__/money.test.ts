import { describe, it, expect } from "vitest";
import { formatMoney } from "../money";

describe("formatMoney", () => {
  it("formats INR minor units", () => {
    expect(formatMoney(450000, "INR")).toBe("₹4,500.00");
  });
  it("formats USD minor units", () => {
    expect(formatMoney(1299, "USD")).toBe("$12.99");
  });
});
