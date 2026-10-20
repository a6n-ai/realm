import { ValidationError } from "@foundry/commons";
import { dayTypeOf, offeredLengths, resolveCell } from "./resolve";
import type { BookingChoice, ClassPricing, PriceTable, Quote } from "./types";

const GRID_MS = 30 * 60_000;

export type QuoteInput = {
  pricing: ClassPricing;
  layers: (PriceTable | null | undefined)[];
  globalTable: PriceTable;
  occursOn: string;
  windowStart: Date;
  windowEnd: Date;
  startsAt: Date;
  choice: BookingChoice;
  extensionSteps: number;
  children: number;
  adults: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function quoteBooking(input: QuoteInput): Quote {
  const { pricing, layers, globalTable, windowStart, windowEnd, startsAt, choice } = input;
  const day = dayTypeOf(input.occursOn);

  if (!Number.isInteger(input.children) || input.children < 1) {
    throw new ValidationError("At least one child is required.");
  }
  if (!Number.isInteger(input.extensionSteps) || input.extensionSteps < 0) {
    throw new ValidationError("Extension is invalid.");
  }
  const offset = startsAt.getTime() - windowStart.getTime();
  if (startsAt.getTime() >= windowEnd.getTime() || offset < 0 || offset % GRID_MS !== 0) {
    throw new ValidationError("Start time is outside the class window.");
  }

  let minutes: number;
  let priceKey: string;
  let adultsIncluded = 0;
  if (choice.kind === "option") {
    const option = pricing.mode === "options" ? pricing.options.find((o) => o.key === choice.key) : undefined;
    if (!option) throw new ValidationError("That option is not offered.");
    minutes = option.lengthMinutes;
    priceKey = `opt:${option.key}`;
    adultsIncluded = option.adultsIncluded;
  } else {
    minutes = choice.minutes;
    priceKey = `len:${minutes}`;
    const windowMinutes = (windowEnd.getTime() - windowStart.getTime()) / 60_000;
    if (pricing.mode !== "length" || !offeredLengths(pricing, globalTable, windowMinutes).includes(minutes)) {
      throw new ValidationError("That length is not offered.");
    }
  }

  let extensionPerChild = 0;
  let extensionMinutes = 0;
  if (input.extensionSteps > 0) {
    if (!pricing.extension) throw new ValidationError("Extension is not available for this class.");
    const step = resolveCell("ext", day, [...layers.slice(0, 1), { ext: pricing.extension.price }]);
    if (step === null) throw new ValidationError("No extension price is set.");
    extensionPerChild = round2(step * input.extensionSteps);
    extensionMinutes = pricing.extension.stepMinutes * input.extensionSteps;
  }

  const endsAt = new Date(startsAt.getTime() + (minutes + extensionMinutes) * 60_000);
  if (endsAt.getTime() > windowEnd.getTime()) {
    throw new ValidationError("Booking runs past the class window.");
  }

  const perChild = resolveCell(priceKey, day, layers);
  if (perChild === null) throw new ValidationError("No price is set for that choice.");

  const extraAdults = Math.max(0, input.adults - pricing.adults.free - adultsIncluded);
  let adultCharge = 0;
  if (extraAdults > 0) {
    const unit = pricing.adults.extraPrice?.[day];
    if (typeof unit !== "number") throw new ValidationError("Extra adults are not allowed for this class.");
    adultCharge = round2(unit * extraAdults);
  }

  return {
    endsAt,
    perChild,
    extensionPerChild,
    extraAdults,
    adultCharge,
    subtotal: round2(input.children * (perChild + extensionPerChild) + adultCharge),
  };
}
