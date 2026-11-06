import { isComingSoon, publicPlans } from "@/components/landing/plan-options";
import { listableMealSizes, type CatalogSnapshot } from "@/lib/catalog/types";
import { dateTimeFormat } from "@/lib/intl/date-format";
import { effectivePrice } from "@/lib/pricing";

/** "11 PM" for an hour of the day. */
export const hourLabel = (h: number) =>
  dateTimeFormat("en-CA", { hour: "numeric", timeZone: "UTC" }).format(Date.UTC(2026, 0, 1, h)).replace(/\./g, "").toUpperCase();

/** Lowest live per-tiffin rate across orderable plans (the "from" figure), or null. */
export function lowestRate(catalog: CatalogSnapshot): number | null {
  const plans = publicPlans(catalog.plans).filter((p) => !isComingSoon(p.key));
  const rates = listableMealSizes(catalog.mealSizes)
    .filter((m) => !m.trial && plans.some((p) => p.key === m.planKey))
    .map((m) => effectivePrice(m.basePrice, m));
  return rates.length ? Math.min(...rates) : null;
}

/** Biggest duration discount in percent, or null when none runs. */
export function biggestDurationOff(catalog: CatalogSnapshot): number | null {
  const off = (catalog.discounts ?? []).filter((d) => d.kind === "duration" && d.percent > 0).map((d) => d.percent);
  return off.length ? Math.max(...off) : null;
}

export type TrialOffer = { href: string; maxDays: number; rate: number };

/** "one day" / "up to 3 days": how long the trial runs, for "Try … first". */
export const trialLength = (t: TrialOffer) => (t.maxDays === 1 ? "one day" : `up to ${t.maxDays} days`);

/** The open trial: its cheapest size on an orderable plan, linked as a quote so the wizard opens
 *  on the trial's Start step after sign-in. Null when trials are off or no trial size is listed. */
export function trialOffer(catalog: CatalogSnapshot, settings: { maxDays: number | null; weekdays: readonly string[] }): TrialOffer | null {
  if (settings.maxDays == null || settings.maxDays < 1 || settings.weekdays.length === 0) return null;
  const plans = publicPlans(catalog.plans).filter((p) => !isComingSoon(p.key));
  const [best] = listableMealSizes(catalog.mealSizes)
    .filter((m) => m.trial && plans.some((p) => p.key === m.planKey))
    .map((m) => ({ m, rate: effectivePrice(m.basePrice, m) }))
    .sort((a, b) => a.rate - b.rate);
  if (!best) return null;
  const q = new URLSearchParams({ p: best.m.planKey, m: best.m.publicId });
  return { href: `/subscribe?${q}`, maxDays: settings.maxDays, rate: best.rate };
}

/** Free for every customer: no base charge and no active strategy that adds one. Conditional
 *  waivers don't count, so copy never promises free delivery to someone who would pay it. */
export function deliveryIsFree(catalog: CatalogSnapshot): boolean {
  const dc = catalog.deliveryCharges;
  return !dc || (dc.baseCharge <= 0 && dc.deliveryStrategies.every((s) => !s.active || s.chargeValue <= 0));
}

/** "$10" or "$10.40" in the market's currency: short enough for a page title. */
export function shortMoney(amount: number, currency: string): string {
  const whole = Number.isInteger(amount);
  return new Intl.NumberFormat("en-CA", { style: "currency", currency, minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 }).format(amount);
}
