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
