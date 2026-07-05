import { describe, expect, it } from "vitest";
import { inquiryFormSchema } from "./inquiry-schema";

const base = { fullName: "Priya", sourceKey: "manual" };

describe("inquiryFormSchema phone", () => {
  it("rejects a too-short number", () => {
    const r = inquiryFormSchema.safeParse({ ...base, phone: "123" });
    expect(r.success).toBe(false);
  });
  it("accepts a valid E.164 number", () => {
    const r = inquiryFormSchema.safeParse({ ...base, phone: "+919876543210" });
    expect(r.success).toBe(true);
  });
});
