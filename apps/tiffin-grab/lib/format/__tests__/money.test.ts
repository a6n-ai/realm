import { describe, it, expect } from "vitest";
import { formatMinor } from "../money";

describe("formatMinor", () => {
  it("formats INR minor units", () => {
    expect(formatMinor(450000, "INR")).toBe("₹4,500.00");
  });
  it("formats USD minor units", () => {
    expect(formatMinor(1299, "USD")).toBe("$12.99");
  });
});
