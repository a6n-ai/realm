import { describe, expect, it } from "vitest";
import { normalizeAddress } from "./suppression";

describe("normalizeAddress", () => {
  it("lowercases and trims an email", () => {
    expect(normalizeAddress("  Foo@Bar.COM ")).toBe("foo@bar.com");
  });

  it("strips formatting from a phone number but keeps the plus", () => {
    expect(normalizeAddress("+1 (416) 555-0134")).toBe("+14165550134");
  });

  it("is idempotent", () => {
    expect(normalizeAddress(normalizeAddress("Foo@Bar.com"))).toBe("foo@bar.com");
  });
});
