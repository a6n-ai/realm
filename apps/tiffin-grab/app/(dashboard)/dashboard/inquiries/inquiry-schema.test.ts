import { describe, expect, it } from "vitest";
import { inquiryFormSchema } from "./inquiry-schema";

const base = { fullName: "Priya", sourceKey: "manual", email: "priya@test.invalid" };

describe("inquiryFormSchema phone", () => {
  it("rejects an empty number", () => {
    // phone has no format validation by design (see inquiry-schema.ts) — only
    // presence is required, deliverability is judged by postal/zone later.
    const r = inquiryFormSchema.safeParse({ ...base, phone: "" });
    expect(r.success).toBe(false);
  });
  it("accepts a valid E.164 number", () => {
    const r = inquiryFormSchema.safeParse({ ...base, phone: "+919876543210" });
    expect(r.success).toBe(true);
  });
});
