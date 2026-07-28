import { describe, expect, it } from "vitest";
import { passwordSchema } from "../password";

describe("passwordSchema", () => {
  it("rejects shorter than 12", () => {
    expect(passwordSchema.safeParse("short12").success).toBe(false);
    expect(passwordSchema.safeParse("hunter2!only".slice(0, 11)).success).toBe(false);
  });
  it("accepts 12+ and returns the value", () => {
    expect(passwordSchema.parse("hunter2!long")).toBe("hunter2!long");
  });
  it("rejects over 256", () => {
    expect(passwordSchema.safeParse("x".repeat(257)).success).toBe(false);
  });
});
