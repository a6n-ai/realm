import { describe, expect, it } from "vitest";
import { quoteBooking } from "../payments.service";
import { isIanaTimeZone } from "@/lib/app-clock";

const cash = {
  id: "cash",
  kind: "manual" as const,
  enabled: true,
  label: "Cash",
  taxes: [{ name: "GST", ratePct: 9 }],
};

describe("quoteBooking", () => {
  it("multiplies seat price and adds method tax on the server", () => {
    expect(quoteBooking("68", 2, cash)).toEqual({ subtotal: 136, taxTotal: 12.24, total: 148.24 });
  });

  it("rejects a negative class price", () => {
    expect(() => quoteBooking(-1, 1, cash)).toThrow(/price/i);
  });
});

describe("isIanaTimeZone", () => {
  it("accepts Asia/Singapore and rejects garbage", () => {
    expect(isIanaTimeZone("Asia/Singapore")).toBe(true);
    expect(isIanaTimeZone("Not/AZone")).toBe(false);
  });
});
