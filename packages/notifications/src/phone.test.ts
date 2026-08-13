import { describe, expect, it } from "vitest";
import { isSmsDeliverable, toE164 } from "./phone";

describe("toE164", () => {
  it("adds the country code to a bare 10-digit Canadian number", () => {
    expect(toE164("4165550134")).toBe("+14165550134");
  });

  it("keeps an already-qualified number", () => {
    expect(toE164("+14165550134")).toBe("+14165550134");
  });

  it("strips formatting", () => {
    expect(toE164("(416) 555-0134")).toBe("+14165550134");
    expect(toE164("416.555.0134")).toBe("+14165550134");
  });

  it("handles a leading 1 without a plus", () => {
    expect(toE164("14165550134")).toBe("+14165550134");
  });

  it("rejects a number that is too short or too long", () => {
    expect(toE164("5550134")).toBeNull();
    expect(toE164("123456789012345678")).toBeNull();
  });

  it("rejects empty and junk input", () => {
    expect(toE164("")).toBeNull();
    expect(toE164("not a phone")).toBeNull();
  });

  it("preserves a non-North-American number that already carries a plus", () => {
    expect(toE164("+442071838750")).toBe("+442071838750");
  });

  it("is idempotent", () => {
    expect(toE164(toE164("(416) 555-0134")!)).toBe("+14165550134");
  });
});

describe("isSmsDeliverable", () => {
  it("allows a verified number for marketing", () => {
    expect(isSmsDeliverable({ phone: "+14165550134", phoneVerified: true }, "marketing")).toBe(true);
  });

  it("blocks an unverified number for marketing", () => {
    expect(isSmsDeliverable({ phone: "+14165550134", phoneVerified: false }, "marketing")).toBe(false);
  });

  it("allows an unverified number for a transactional message", () => {
    expect(isSmsDeliverable({ phone: "+14165550134", phoneVerified: false }, "transactional")).toBe(
      true,
    );
  });

  it("blocks a missing number for either kind", () => {
    expect(isSmsDeliverable({ phone: null, phoneVerified: true }, "transactional")).toBe(false);
    expect(isSmsDeliverable({ phone: null, phoneVerified: true }, "marketing")).toBe(false);
  });
});
