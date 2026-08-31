import { describe, expect, it } from "vitest";
import { derivePin, verifyPin } from "./pin";

describe("derivePin", () => {
  it("takes the last four digits regardless of formatting", () => {
    expect(derivePin("+1 (416) 555-1234")).toBe("1234");
    expect(derivePin("4165551234")).toBe("1234");
    expect(derivePin("+14165551234")).toBe("1234");
  });

  it("is null when there are fewer than four digits to take", () => {
    expect(derivePin("123")).toBeNull();
    expect(derivePin("--")).toBeNull();
    expect(derivePin("")).toBeNull();
    expect(derivePin(null)).toBeNull();
    expect(derivePin(undefined)).toBeNull();
  });

  it("ignores an extension after the number", () => {
    // Digits are digits: an extension shifts which four are last, which is why
    // checkout stores E.164 and never a free-text "ext 12".
    expect(derivePin("4165551234 ext 99")).toBe("3499");
  });
});

describe("verifyPin", () => {
  it("accepts the derived pin, formatted or not", () => {
    expect(verifyPin("1234", "+1 416 555 1234")).toBe(true);
    expect(verifyPin("12 34", "4165551234")).toBe(true);
  });

  it("rejects a wrong pin, a short pin, and a long pin", () => {
    expect(verifyPin("1235", "4165551234")).toBe(false);
    expect(verifyPin("234", "4165551234")).toBe(false);
    expect(verifyPin("51234", "4165551234")).toBe(false);
  });

  it("rejects everything when no pin can be derived", () => {
    expect(verifyPin("1234", "12")).toBe(false);
    expect(verifyPin("", "")).toBe(false);
    expect(verifyPin(null, null)).toBe(false);
  });
});
