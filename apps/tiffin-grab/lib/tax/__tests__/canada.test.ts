import { describe, expect, it } from "vitest";
import { priceSubscription } from "@/lib/pricing/engine";
import {
  DEFAULT_PROVINCE_TAXES,
  PROVINCES,
  normalizeProvince,
  provinceFromPostalCode,
  resolveProvince,
  resolveTaxLines,
} from "@/lib/tax/canada";

describe("province resolution", () => {
  it("reads the province from a Canadian postal code's first letter", () => {
    expect(provinceFromPostalCode("M5V 3L9")).toBe("ON");
    expect(provinceFromPostalCode("V6B 1A1")).toBe("BC");
    expect(provinceFromPostalCode("T2P 1J9")).toBe("AB");
    expect(provinceFromPostalCode("H3B 2Y5")).toBe("QC");
    expect(provinceFromPostalCode("B3H 4R2")).toBe("NS");
  });

  it("is case and whitespace insensitive", () => {
    expect(provinceFromPostalCode(" m5v3l9 ")).toBe("ON");
  });

  it("returns null for a non-Canadian or empty code", () => {
    expect(provinceFromPostalCode("90210")).toBeNull();
    expect(provinceFromPostalCode("")).toBeNull();
    expect(provinceFromPostalCode(null)).toBeNull();
  });

  it("accepts a province code or a full province name", () => {
    expect(normalizeProvince("ON")).toBe("ON");
    expect(normalizeProvince(" on ")).toBe("ON");
    expect(normalizeProvince("Ontario")).toBe("ON");
    expect(normalizeProvince("british columbia")).toBe("BC");
    expect(normalizeProvince("Narnia")).toBeNull();
  });

  it("prefers an explicit province over the postal code", () => {
    // A customer who moved but kept a stale postal code on file: the explicit
    // field is the more deliberate signal.
    expect(resolveProvince({ province: "AB", postalCode: "M5V 3L9" })).toBe("AB");
    expect(resolveProvince({ province: null, postalCode: "M5V 3L9" })).toBe("ON");
  });
});

describe("tax lines", () => {
  it("gives Ontario a single 13% HST line", () => {
    expect(resolveTaxLines({ postalCode: "M5V 3L9" })).toEqual([{ name: "HST", ratePct: 13 }]);
  });

  it("gives BC two lines — GST and PST", () => {
    expect(resolveTaxLines({ postalCode: "V6B 1A1" })).toEqual([
      { name: "GST", ratePct: 5 },
      { name: "PST", ratePct: 7 },
    ]);
  });

  it("charges nothing when the province cannot be identified", () => {
    // Deliberate: guessing a rate would remit someone's money to the wrong
    // jurisdiction, which is worse than charging none.
    expect(resolveTaxLines({ postalCode: "90210" })).toEqual([]);
    expect(resolveTaxLines({})).toEqual([]);
  });

  it("lets an admin override a province's rates", () => {
    const lines = resolveTaxLines({ postalCode: "V6B 1A1" }, { BC: [{ name: "GST", ratePct: 5 }] });
    expect(lines).toEqual([{ name: "GST", ratePct: 5 }]);
  });

  it("omits zero-rate lines so the receipt stays clean", () => {
    // e.g. an admin zeroing BC PST because food is PST-exempt.
    const lines = resolveTaxLines(
      { postalCode: "V6B 1A1" },
      { BC: [{ name: "GST", ratePct: 5 }, { name: "PST", ratePct: 0 }] },
    );
    expect(lines).toEqual([{ name: "GST", ratePct: 5 }]);
  });

  it("covers every province with at least one rate", () => {
    for (const p of PROVINCES) {
      expect(DEFAULT_PROVINCE_TAXES[p].length).toBeGreaterThan(0);
    }
  });
});

describe("tax applies after discounts, not before", () => {
  const catalog = {
    mealSize: { id: "msz_1", basePrice: 100 },
    frequency: { key: "custom_mon", daysPerWeek: 1, courierDiscountPct: 0 },
    tiers: [{ minQty: 1, maxQty: null, upliftPct: 0 }],
    addons: [],
  } as never;
  const selections = {
    mealSizeId: "msz_1",
    frequencyKey: "custom_mon",
    persons: 1,
    mealSlots: ["lunch"],
    includeSaturday: false,
    includeSunday: false,
    durationWeeks: 1,
    startDate: "2026-01-05",
  } as never;

  it("taxes the post-discount base, and reports subtotal/tax/total separately", () => {
    const withoutDiscount = priceSubscription(selections, catalog, [], [{ name: "HST", ratePct: 13 }]);
    const withDiscount = priceSubscription(
      selections,
      catalog,
      [{ label: "Coins (500)", amount: 50 }],
      [{ name: "HST", ratePct: 13 }],
    );

    // Same subtotal, but the $50 discount must shrink the tax too.
    expect(withDiscount.subtotal).toBe(withoutDiscount.subtotal);
    expect(withDiscount.taxTotal).toBeLessThan(withoutDiscount.taxTotal);

    const taxableBase = withDiscount.subtotal - 50;
    expect(withDiscount.taxTotal).toBeCloseTo(taxableBase * 0.13, 2);
    expect(withDiscount.total).toBeCloseTo(taxableBase + withDiscount.taxTotal, 2);
  });

  it("never taxes below zero when discounts exceed the subtotal", () => {
    const result = priceSubscription(
      selections,
      catalog,
      [{ label: "Huge coupon", amount: 100_000 }],
      [{ name: "HST", ratePct: 13 }],
    );
    expect(result.taxTotal).toBe(0);
    expect(result.total).toBe(0);
  });
});
