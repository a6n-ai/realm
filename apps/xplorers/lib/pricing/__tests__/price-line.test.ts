import { describe, expect, it } from "vitest";
import { DEFAULT_PRICE_TABLE } from "../defaults";
import { priceLine } from "../price-line";
import type { ClassPricing } from "../types";

const base: ClassPricing = {
  mode: "length",
  defaultLengthMinutes: 90,
  options: [],
  extension: null,
  adults: { free: 0, extraPrice: null },
};

describe("priceLine", () => {
  it("length mode shows the lowest offered weekday price", () => {
    expect(priceLine(base, null, DEFAULT_PRICE_TABLE, "SGD")).toBe("From S$68 / child");
  });

  it("a class override beats the global table", () => {
    expect(priceLine(base, { "len:90": { weekday: 60 } }, DEFAULT_PRICE_TABLE, "SGD")).toBe("From S$60 / child");
  });

  it("options mode joins each option with its price", () => {
    const pricing: ClassPricing = {
      ...base,
      mode: "options",
      options: [
        { key: "taster", label: "taster", lengthMinutes: 60, adultsIncluded: 0 },
        { key: "two", label: "for 2 hours", lengthMinutes: 120, adultsIncluded: 0 },
      ],
    };
    const prices = { "opt:taster": { weekday: 48 }, "opt:two": { weekday: 78 } };
    expect(priceLine(pricing, prices, {}, "SGD")).toBe("S$48 taster · S$78 for 2 hours");
  });

  it("asks to enquire when nothing is priced", () => {
    expect(priceLine(base, null, {}, "SGD")).toBe("Enquire for dates & pricing");
  });
});
