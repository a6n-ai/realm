import { describe, expect, it } from "vitest";
import { formatAddressLine } from "./address-line";

describe("formatAddressLine", () => {
  it("joins unit, line, city and postal code, skipping blanks", () => {
    expect(formatAddressLine({ addressUnit: "5", addressLine: "1 Main St", city: "Toronto", postalCode: "M5V 1A1" })).toBe("5 - 1 Main St, Toronto, M5V 1A1");
    expect(formatAddressLine({ addressUnit: null, addressLine: "1 Main St", city: "", postalCode: "M5V 1A1" })).toBe("1 Main St, M5V 1A1");
  });
});
