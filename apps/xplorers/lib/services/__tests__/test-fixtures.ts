import type { ClassPricing } from "@/lib/pricing/types";

export const TEST_PRICING: ClassPricing = {
  mode: "length",
  defaultLengthMinutes: 60,
  options: [],
  extension: null,
  adults: { free: 0, extraPrice: null },
};

const HOUR = 3_600_000;

export const occurrenceWindow = (startsAt: Date) => ({ startsAt, endsAt: new Date(startsAt.getTime() + HOUR), capacity: 10 });

export const bookingWindow = (startsAt: Date) => ({ startsAt, endsAt: new Date(startsAt.getTime() + HOUR), lengthMinutes: 60 });

const MIN = 60_000;

/** Priced fixtures: a 9:00-12:00-style 180 min window offering len:90 (and 120/180 from the global table). */
export const PRICED_PRICING: ClassPricing = { ...TEST_PRICING, defaultLengthMinutes: 90 };

export const pricedWindow = (startsAt: Date, capacity = 10) => ({
  startsAt,
  endsAt: new Date(startsAt.getTime() + 180 * MIN),
  capacity,
});

/** Same price on weekdays and weekends so totals do not depend on the day the test runs. */
export const flatPrice = (price: string | number, key = "len:90") => ({
  [key]: { weekday: Number(price), weekend: Number(price) },
});

export type TestOccurrence = { publicId: string; startsAt: Date };

/** A 90 minute booking at the start of the window, with room for overrides. */
export const bookReq = (occ: TestOccurrence, childPublicIds: string[], extra: Record<string, unknown> = {}) => ({
  occurrencePublicId: occ.publicId,
  startsAt: occ.startsAt.toISOString(),
  choice: { kind: "length" as const, minutes: 90 },
  extensionSteps: 0,
  childPublicIds,
  adults: 0,
  ...extra,
});
