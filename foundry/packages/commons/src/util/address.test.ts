import { describe, expect, it } from "vitest";
import {
  deliveryAddressSchema,
  normalizePostalCode,
  profileAddressSchema,
} from "./address";

describe("normalizePostalCode", () => {
  it("uppercases and inserts a space after the FSA", () => {
    expect(normalizePostalCode("m5v2t6")).toBe("M5V 2T6");
    expect(normalizePostalCode("M5V  2T6")).toBe("M5V 2T6");
  });

  it("returns short input unchanged apart from casing", () => {
    expect(normalizePostalCode("m5v")).toBe("M5V");
  });
});

describe("profileAddressSchema", () => {
  it("accepts a typical profile address", () => {
    const parsed = profileAddressSchema.safeParse({
      addressLine: "123 Maple St",
      addressUnit: "4B",
      city: "Toronto",
      postalCode: "M5V 2T6",
      province: "ON",
    });
    expect(parsed.success).toBe(true);
  });
});

describe("deliveryAddressSchema", () => {
  it("rejects blank required fields", () => {
    const parsed = deliveryAddressSchema.safeParse({
      fullName: " ",
      addressLine: "1 St",
      city: "Toronto",
      postalCode: "M5V 2T6",
    });
    expect(parsed.success).toBe(false);
  });
});
