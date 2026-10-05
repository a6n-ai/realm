import { describe, expect, it } from "vitest";
import { normalizeCap } from "../app-settings.service";
import { normalizeCode, normalizeCouponWrite, normalizeDiscountWrite } from "../discounts.service";

describe("normalizeCode", () => {
  it("trims and uppercases", () => {
    expect(normalizeCode("  summer10 ")).toBe("SUMMER10");
  });
});

describe("normalizeDiscountWrite", () => {
  it("requires exactly one of percent or amount", () => {
    expect(() => normalizeDiscountWrite({ name: "X", scope: "all" }, null)).toThrow(/percent or an amount/i);
    expect(() => normalizeDiscountWrite({ name: "X", scope: "all", percentOff: "10", amountOff: "5" }, null)).toThrow(
      /percent or an amount/i,
    );
  });

  it("rejects percent over 100 and non-positive amounts", () => {
    expect(() => normalizeDiscountWrite({ name: "X", scope: "all", percentOff: "120" }, null)).toThrow(/percent/i);
    expect(() => normalizeDiscountWrite({ name: "X", scope: "all", amountOff: "0" }, null)).toThrow(/amount/i);
  });

  it("clears target columns that do not belong to the scope", () => {
    expect(normalizeDiscountWrite({ name: "Kids", scope: "category", category: "kids", percentOff: "10" }, 5n)).toMatchObject({
      scope: "category",
      category: "kids",
      sessionId: null,
      percentOff: "10.00",
      amountOff: null,
    });
  });

  it("requires a category or class for those scopes", () => {
    expect(() => normalizeDiscountWrite({ name: "X", scope: "category", percentOff: "10" }, null)).toThrow(/category/i);
    expect(() => normalizeDiscountWrite({ name: "X", scope: "session", percentOff: "10" }, null)).toThrow(/class/i);
  });

  it("rejects an end before the start", () => {
    expect(() => normalizeDiscountWrite({ name: "X", scope: "all", percentOff: "10", startsAt: 2000, endsAt: 1000 }, null)).toThrow(
      /end/i,
    );
  });
});

describe("normalizeCouponWrite", () => {
  it("normalizes the code and limits", () => {
    expect(
      normalizeCouponWrite({
        code: " fall-5 ",
        name: "Fall",
        amountOff: "5",
        maxRedemptions: "10",
        maxPerUser: "",
        allowedPaymentMethods: ["cash"],
      }),
    ).toMatchObject({ code: "FALL-5", amountOff: "5.00", percentOff: null, maxRedemptions: 10, maxPerUser: null, allowedPaymentMethods: ["cash"] });
  });

  it("rejects bad codes", () => {
    expect(() => normalizeCouponWrite({ code: "a b", name: "X", amountOff: "5" })).toThrow(/code/i);
    expect(() => normalizeCouponWrite({ code: "AB", name: "X", amountOff: "5" })).toThrow(/code/i);
  });

  it("rejects non-positive limits", () => {
    expect(() => normalizeCouponWrite({ code: "ABC", name: "X", amountOff: "5", maxRedemptions: "0" })).toThrow(/limit/i);
  });
});

describe("normalizeCap", () => {
  it("rejects an empty cap instead of saving 0%", () => {
    expect(() => normalizeCap("")).toThrow(/cap/i);
    expect(() => normalizeCap("abc")).toThrow(/cap/i);
    expect(() => normalizeCap("101")).toThrow(/cap/i);
    expect(normalizeCap("25")).toBe(25);
    expect(normalizeCap("0")).toBe(0);
  });
});
