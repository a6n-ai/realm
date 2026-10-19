import { describe, expect, it } from "vitest";
import { ValidationError } from "@foundry/commons";
import { assertCanBook, isPubliclyListed, remainingSeats } from "../booking-policy";
import { normalizeClassWrite } from "../studio-sessions.service";

const future = new Date("2026-10-01T10:00:00.000Z");
const now = new Date("2026-09-16T10:00:00.000Z");

describe("isPubliclyListed", () => {
  it("lists a published upcoming session", () => {
    expect(isPubliclyListed({ published: true, archived: false, startsAt: future }, now)).toBe(true);
  });

  it("hides unpublished, archived, and past sessions", () => {
    expect(isPubliclyListed({ published: false, archived: false, startsAt: future }, now)).toBe(false);
    expect(isPubliclyListed({ published: true, archived: true, startsAt: future }, now)).toBe(false);
    expect(isPubliclyListed({ published: true, archived: false, startsAt: new Date("2026-09-01T10:00:00.000Z") }, now)).toBe(
      false,
    );
  });
});

describe("normalizeClassWrite", () => {
  it("requires a category and a positive capacity", () => {
    expect(() =>
      normalizeClassWrite({
        title: "Kids Club",
        capacity: 8,
      }),
    ).toThrow(/category/);
    expect(() =>
      normalizeClassWrite({
        title: "Kids Club",
        category: "kids",
        capacity: 0,
      }),
    ).toThrow(/Capacity/);
  });

  it("writes the summary and leaves the rest of the class untouched", () => {
    const record = normalizeClassWrite({ title: "Kids Club", category: "kids", description: " Hi ", capacity: 8 });
    expect(record.published).toBe(false);
    expect(record.summary).toBe("Hi");
    expect(record.photos).toEqual([]);
    expect(record).not.toHaveProperty("pricing");
  });

  const base = { title: "Woodwork", category: "kids", capacity: 8 };
  const pattern = {
    weekdays: [6],
    nthOfMonth: null,
    startClock: "10:00",
    endClock: "13:00",
    startsOn: "2026-11-01",
    endsOn: null,
    excludeMonths: [],
  };
  const lengthPricing = {
    mode: "length",
    defaultLengthMinutes: 90,
    options: [],
    extension: null,
    adults: { free: 1, extraPrice: null },
  };

  it("rejects a len:240 override when the pattern window is 180 minutes", () => {
    expect(() =>
      normalizeClassWrite({ ...base, pattern, pricing: lengthPricing, prices: { "len:240": { weekday: 10 } } }),
    ).toThrow(/len:240/);
    expect(() =>
      normalizeClassWrite({ ...base, pattern, pricing: lengthPricing, prices: { "len:180": { weekday: 10 } } }),
    ).not.toThrow();
  });

  it("rejects duplicate option keys", () => {
    const option = { key: "taster", label: "Taster", lengthMinutes: 60, adultsIncluded: 1 };
    expect(() =>
      normalizeClassWrite({ ...base, pattern, pricing: { ...lengthPricing, mode: "options", options: [option, option] } }),
    ).toThrow(/unique/i);
  });

  it("accepts Woodwork options (taster 60, regular 120) and keys their prices", () => {
    const record = normalizeClassWrite({
      ...base,
      pattern,
      pricing: {
        ...lengthPricing,
        mode: "options",
        options: [
          { key: "taster", label: "Taster", lengthMinutes: 60, adultsIncluded: 1 },
          { key: "regular", label: "Regular", lengthMinutes: 120, adultsIncluded: 1 },
        ],
      },
      prices: { "opt:taster": { weekday: 40 }, "opt:regular": { weekday: 70 } },
    });
    expect((record.pricing as { options: unknown[] }).options).toHaveLength(2);
  });

  it("rejects an option longer than the window, an unknown opt key and ext without extension", () => {
    const longOption = { key: "long", label: "Long", lengthMinutes: 240, adultsIncluded: 0 };
    expect(() =>
      normalizeClassWrite({ ...base, pattern, pricing: { ...lengthPricing, mode: "options", options: [longOption] } }),
    ).toThrow(/window/i);
    expect(() =>
      normalizeClassWrite({ ...base, pattern, pricing: lengthPricing, prices: { "opt:nope": { weekday: 1 } } }),
    ).toThrow(/opt:nope/);
    expect(() =>
      normalizeClassWrite({ ...base, pattern, pricing: lengthPricing, prices: { ext: { weekday: 1 } } }),
    ).toThrow(/ext/);
  });

  it("rejects bad lengths, ages and bookingType", () => {
    expect(() => normalizeClassWrite({ ...base, pricing: { ...lengthPricing, defaultLengthMinutes: 45 } })).toThrow(/30/);
    expect(() => normalizeClassWrite({ ...base, ageMin: 9, ageMax: 5 })).toThrow(/age/i);
    expect(() => normalizeClassWrite({ ...base, bookingType: "walkin" })).toThrow(/booking/i);
  });

  it("skips pricing for enquire-only classes and needs no pattern", () => {
    const record = normalizeClassWrite({ ...base, bookingType: "enquire_only", prices: { "len:999": { weekday: 1 } } });
    expect(record.bookingType).toBe("enquire_only");
    expect(record.prices).toBeNull();
  });

  it("keeps uploaded photos", () => {
    expect(
      normalizeClassWrite(
        {
          title: "Kids Club",
          category: "kids",
          capacity: 8,
          photos: ["/api/files/public/classes/kite.png"],
        },
      ).photos,
    ).toEqual(["/api/files/public/classes/kite.png"]);
  });
});

describe("concurrent last-seat books", () => {
  it("confirms the first seat and rejects the second once remaining is 0", () => {
    const capacity = 1;
    let confirmed = 0;
    const bookable = (remaining: number) => ({
      published: true,
      archived: false,
      startsAt: future,
      now,
      remaining,
      seats: 1,
    });

    const firstRemaining = remainingSeats(capacity, confirmed);
    expect(() => assertCanBook(bookable(firstRemaining))).not.toThrow();
    confirmed += 1;

    const secondRemaining = remainingSeats(capacity, confirmed);
    expect(secondRemaining).toBe(0);
    expect(() => assertCanBook(bookable(secondRemaining))).toThrow(ValidationError);
    expect(() => assertCanBook(bookable(secondRemaining))).toThrow(/full/);
  });
});
