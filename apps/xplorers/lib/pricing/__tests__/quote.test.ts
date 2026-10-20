import { describe, expect, it } from "vitest";
import { quoteBooking } from "../quote";
import type { ClassPricing, PriceTable } from "../types";

const global: PriceTable = {
  "len:90": { weekday: 68, weekend: 78 },
  "len:120": { weekday: 88, weekend: 98 },
  "len:180": { weekday: 128, weekend: 138 },
  "len:240": { weekday: 158, weekend: 168 },
};

const lengthPricing: ClassPricing = {
  mode: "length",
  defaultLengthMinutes: 90,
  options: [],
  extension: null,
  adults: { free: 0, extraPrice: null },
};

describe("quoteBooking", () => {
  it("named option + extension + extra adult", () => {
    const pricing: ClassPricing = {
      mode: "options",
      defaultLengthMinutes: 90,
      options: [{ key: "standard", label: "Standard", lengthMinutes: 90, adultsIncluded: 1 }],
      extension: { stepMinutes: 30, price: { weekday: 10, weekend: 10 } },
      adults: { free: 0, extraPrice: { weekday: 10, weekend: 10 } },
    };
    const q = quoteBooking({
      pricing,
      layers: [null, { "opt:standard": { weekday: 78, weekend: 78 } }, global],
      globalTable: global,
      occursOn: "2026-10-25",
      windowStart: new Date("2026-10-25T01:30:00Z"),
      windowEnd: new Date("2026-10-25T04:00:00Z"),
      startsAt: new Date("2026-10-25T01:30:00Z"),
      choice: { kind: "option", key: "standard" },
      extensionSteps: 1,
      children: 2,
      adults: 2,
    });
    expect(q).toMatchObject({ perChild: 78, extensionPerChild: 10, extraAdults: 1, adultCharge: 10, subtotal: 2 * 88 + 10 });
    expect(q.endsAt.toISOString()).toBe("2026-10-25T03:30:00.000Z");
  });

  const base = {
    pricing: lengthPricing,
    layers: [global] as PriceTable[],
    globalTable: global,
    occursOn: "2026-10-22",
    windowStart: new Date("2026-10-22T01:00:00Z"),
    windowEnd: new Date("2026-10-22T04:00:00Z"),
    startsAt: new Date("2026-10-22T01:00:00Z"),
    choice: { kind: "length", minutes: 90 } as const,
    extensionSteps: 0,
    children: 1,
    adults: 0,
  };

  it("length mode weekday price", () => {
    expect(quoteBooking(base)).toMatchObject({ perChild: 68, subtotal: 68, extraAdults: 0 });
  });

  it("rejects overrun", () => {
    expect(() =>
      quoteBooking({
        ...base,
        startsAt: new Date("2026-10-22T02:30:00Z"),
        choice: { kind: "length", minutes: 120 },
      }),
    ).toThrow(/window/);
  });

  it("rejects extra adult when not allowed", () => {
    expect(() => quoteBooking({ ...base, adults: 1 })).toThrow(/adult/i);
  });

  it("rejects off-grid start, zero children, unconfigured extension", () => {
    expect(() => quoteBooking({ ...base, startsAt: new Date("2026-10-22T01:10:00Z") })).toThrow();
    expect(() => quoteBooking({ ...base, children: 0 })).toThrow();
    expect(() => quoteBooking({ ...base, extensionSteps: 1 })).toThrow(/extension/i);
  });
});
