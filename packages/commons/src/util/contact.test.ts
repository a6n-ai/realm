import { describe, it, expect } from "vitest";
import { emailSchema, normalizeEmail } from "./contact";

describe("emailSchema", () => {
  it("accepts and normalizes a valid email", () => {
    expect(emailSchema.parse("  Foo@Bar.COM ")).toBe("foo@bar.com");
  });
  it("rejects a malformed email", () => {
    expect(emailSchema.safeParse("not-an-email").success).toBe(false);
  });
});

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Foo@Bar.COM ")).toBe("foo@bar.com");
  });
});
