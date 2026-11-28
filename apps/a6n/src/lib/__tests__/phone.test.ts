import { describe, expect, test } from "vitest";
import { formatPhone, phoneFlag, telHref } from "../phone";

describe("phone display", () => {
  test("E.164 shows its country code and flag", () => {
    expect(formatPhone("+6591234567")).toBe("+65 9123 4567");
    expect(phoneFlag("+6591234567")).toBe("🇸🇬");
    expect(phoneFlag("+14165550107")).toBe("🇨🇦");
  });

  test("a local Singapore number gains +65", () => {
    expect(formatPhone("9123 4567")).toBe("+65 9123 4567");
    expect(telHref("9123 4567")).toBe("tel:+6591234567");
  });

  test("text that is not a number stays as typed", () => {
    expect(formatPhone("555-0102")).toBe("555-0102");
    expect(phoneFlag("555-0102")).toBe("");
    expect(formatPhone("")).toBe("");
  });
});

describe("stored phone", () => {
  test("local numbers are saved as Singapore E.164, others untouched", async () => {
    const { toE164 } = await import("../phone");
    expect(toE164(" 9097 6816 ")).toBe("+6590976816");
    expect(toE164("+1 416 555 0107")).toBe("+14165550107");
    expect(toE164("555-0102")).toBe("555-0102");
    expect(toE164("  ")).toBeNull();
  });
});
