import { describe, expect, it } from "vitest";
import { inquiryFormSchema } from "./inquiry-schema";

describe("inquiryFormSchema", () => {
  it("accepts a name alone", () => {
    expect(inquiryFormSchema.safeParse({ fullName: "A", sourceKey: "x" }).success).toBe(true);
  });
  it("accepts a phone alone", () => {
    expect(inquiryFormSchema.safeParse({ phone: "6475551000", sourceKey: "x" }).success).toBe(true);
  });
  it("rejects neither, on the fullName path", () => {
    const r = inquiryFormSchema.safeParse({ sourceKey: "x" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.path).toEqual(["fullName"]);
      expect(r.error.issues[0]?.message).toBe("Enter a name or phone number");
    }
  });
  it("rejects blank name and phone", () => {
    expect(inquiryFormSchema.safeParse({ fullName: " ", phone: "", sourceKey: "x" }).success).toBe(false);
  });
  it("email may be empty but not malformed", () => {
    expect(inquiryFormSchema.safeParse({ fullName: "A", sourceKey: "x", email: "" }).success).toBe(true);
    expect(inquiryFormSchema.safeParse({ fullName: "A", sourceKey: "x", email: "bad" }).success).toBe(false);
  });
  it("accepts nextFollowUpAt", () => {
    expect(inquiryFormSchema.safeParse({ fullName: "A", sourceKey: "x", nextFollowUpAt: 1_800_000_000_000 }).success).toBe(true);
  });
});
