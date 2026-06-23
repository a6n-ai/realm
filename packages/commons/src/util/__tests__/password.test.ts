import { describe, expect, it } from "vitest";
import { passwordSchema } from "../password";

describe("passwordSchema", () => {
  it("rejects shorter than 8", () => {
    expect(passwordSchema.safeParse("short12").success).toBe(false);
  });
  it("accepts 8+ and returns the value", () => {
    expect(passwordSchema.parse("hunter2!")).toBe("hunter2!");
  });
  it("rejects over 256", () => {
    expect(passwordSchema.safeParse("x".repeat(257)).success).toBe(false);
  });
});
