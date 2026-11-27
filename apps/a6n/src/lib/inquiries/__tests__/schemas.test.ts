import { describe, expect, it } from "vitest";
import { createInquirySchema, updateContactSchema } from "../schemas";

const base = { source: "web", nextFollowUpAt: 1 };

describe("phone", () => {
  const ok = (phone: string | null | undefined) => createInquirySchema.safeParse({ ...base, contactName: "A", phone }).success;

  it("accepts E.164", () => expect(ok("+6591234567")).toBe(true));
  it("accepts stored free text", () => expect(ok("(65) 9123-4567")).toBe(true));
  it("accepts empty or missing", () => {
    expect(ok("")).toBe(true);
    expect(ok(undefined)).toBe(true);
  });
  it("rejects junk", () => {
    expect(ok("abc")).toBe(false);
    expect(ok("   ")).toBe(false);
  });
  it("applies to contact edits too", () => {
    expect(updateContactSchema.safeParse({ id: "x", phone: "+6591234567" }).success).toBe(true);
    expect(updateContactSchema.safeParse({ id: "x", phone: "abc" }).success).toBe(false);
  });
});
