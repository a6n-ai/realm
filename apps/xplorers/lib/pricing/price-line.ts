import { offeredLengths, resolveCell } from "./resolve";
import type { ClassPricing, PriceTable } from "./types";

const ENQUIRE = "Enquire for dates & pricing";
const ANY_LENGTH = 24 * 60;

export function money(n: number, currency: string): string {
  if (currency === "SGD") return `S$${n}`;
  return new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 2 }).format(n);
}

/** The one-line price on a class card, derived from the class's pricing mode and price layers. */
export function priceLine(
  pricing: ClassPricing,
  classPrices: PriceTable | null,
  global: PriceTable,
  currency: string,
): string {
  const layers = [classPrices, global];
  if (pricing.mode === "options") {
    const parts = pricing.options.flatMap((o) => {
      const p = resolveCell(`opt:${o.key}`, "weekday", layers);
      return p == null ? [] : [`${money(p, currency)} ${o.label}`];
    });
    return parts.length ? parts.join(" · ") : ENQUIRE;
  }
  const prices = offeredLengths(pricing, { ...global, ...classPrices }, ANY_LENGTH)
    .map((m) => resolveCell(`len:${m}`, "weekday", layers))
    .filter((p): p is number => p != null);
  return prices.length ? `From ${money(Math.min(...prices), currency)} / child` : ENQUIRE;
}

export function lengthLabel(minutes: number): string {
  if (minutes % 60 !== 0) return `${minutes} minutes`;
  return minutes === 60 ? "1 hour" : `${minutes / 60} hours`;
}
