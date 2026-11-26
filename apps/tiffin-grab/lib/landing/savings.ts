import { formatMoney, round2 } from "@foundry/commons/util/money";
import { listableMealSizes, type CatalogSnapshot } from "@/lib/catalog/types";
import { buildPricingCatalog } from "@/lib/pricing/build-catalog";
import { postCatalogSubtotal } from "@/lib/pricing/discounts";
import { priceSubscription } from "@/lib/pricing/engine";
import { effectivePrice } from "@/lib/pricing/meal-size-discount";
import type { PromoLine, PromoReceipt, PromoSavings } from "@/lib/landing/promo-types";
import type { DayOfWeek } from "@/lib/deliveries/schedule/delivery-days";

type CouponLike = { code: string; valuePct: string | null; valueAmount: string | null; minSubtotal: string | null };

// "3 Days/Wk Alternate (MWF)" reads as "Mon, Wed, Fri" on a receipt line.
const DAY = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" } as Record<string, string>;
function frequencyName(snapshot: CatalogSnapshot, key: string): string {
  const f = snapshot.frequencies.find((x) => x.key === key)!;
  const days = f.weekdays ?? [];
  if (days.length === 5 && days.join() === "mon,tue,wed,thu,fri") return "Mon to Fri";
  return days.length > 0 ? days.map((d) => DAY[d] ?? d).join(", ") : f.name;
}

interface Quote { lines: PromoLine[]; size: string; eats: string | null; tiffins: number; perTiffin: number; frequency: string; weeks: number; saving: number }

/** Prices one plan through the checkout engine, then the coupon on what is left, as checkout does. */
function quote(snapshot: CatalogSnapshot, mealSizeId: string, frequencyKey: string, weeks: number, coupon: CouponLike | null, currency: string, everyWeekday = false): Quote | null {
  const size = snapshot.mealSizes.find((m) => m.publicId === mealSizeId)!;
  const plan = snapshot.plans.find((p) => p.key === size.planKey);
  const slot = plan?.offeredSlots[0];
  if (!slot) return null;
  // The receipt shows each frequency at its own eating days (a 5-day plan is Mon-Fri), so tiers resolve as they do at checkout.
  const freq = snapshot.frequencies.find((f) => f.key === frequencyKey);
  // everyWeekday: the best case eats Mon to Fri on any delivery schedule (MWF delivers Tue and Thu food a
  // day early), which is what reaches the top eating-day tier at checkout.
  const weekdays = ["mon", "tue", "wed", "thu", "fri"] as DayOfWeek[];
  const eatingDays = everyWeekday ? weekdays : freq?.weekdays?.length ? (freq.weekdays as DayOfWeek[]) : weekdays.slice(0, freq?.daysPerWeek ?? 5);
  const selections = { mealSizeId, frequencyKey, persons: 1, mealSlots: [slot], eatingDays: eatingDays, includeSaturday: false, includeSunday: false, durationWeeks: weeks, startDate: "2000-01-03" };
  let priced;
  try {
    priced = priceSubscription(selections, buildPricingCatalog(snapshot, selections));
  } catch {
    return null;
  }
  // Short receipt labels; admin names like "Delivery schedule discount - 3 Days/Wk Alternate (MWF)" wrap on a phone.
  const rule = new Map((snapshot.discounts ?? []).map((d) => [d.key, d]));
  const freqName = frequencyName(snapshot, frequencyKey);
  const lines: PromoLine[] = priced.adjustments.filter((a) => a.amount > 0).map((a) => {
    const d = a.discountKey ? rule.get(a.discountKey) : undefined;
    // Plan discounts headline as their percent; the receipt itself shows the money.
    const figure = `${Number(d?.percent ?? 0)}%`;
    if (d?.kind === "delivery") return { label: `${freqName} (${d.percent}%)`, amount: a.amount, figure, perk: `off ${freqName} delivery`, short: freqName };
    if (d?.kind === "duration") return { label: `${weeks}-week plan (${d.percent}%)`, amount: a.amount, figure, perk: `off ${weeks}-week plans`, short: `${weeks}-week plans` };
    return { label: a.label, amount: a.amount };
  });
  const left = postCatalogSubtotal(priced.subtotal, priced.adjustments);
  if (coupon && left >= Number(coupon.minSubtotal ?? 0)) {
    const pct = Number(coupon.valuePct ?? 0);
    const amount = round2(Math.min(left, pct > 0 ? (left * pct) / 100 : Number(coupon.valueAmount ?? 0)));
    const figure = pct > 0 ? `${pct}%` : formatMoney(Math.floor(amount), currency, { whole: true });
    if (amount > 0) lines.push({ label: `Code ${coupon.code}`, amount, figure, perk: `off with code ${coupon.code}`, short: `Code ${coupon.code}` });
  }
  const eats = eatingDays.length > (freq?.weekdays?.length ?? eatingDays.length) ? `Eats ${eatingDays.length} days, delivered ${freqName === "Mon, Wed, Fri" ? "MWF" : freqName}` : null;
  return { lines, size: size.name, eats, tiffins: priced.tiffinCount, perTiffin: priced.perTiffinPrice, frequency: freqName, weeks, saving: round2(lines.reduce((s, l) => s + l.amount, 0)) };
}

function receipt(q: Quote, currency: string, named = false): PromoReceipt {
  return {
    example: named ? `${q.size.replace(/\s+[—–]\s+/g, " · ")}, ${q.weeks} weeks, ${q.frequency}` : `${q.weeks} weeks, ${q.frequency}`,
    subtotalLabel: `${q.tiffins} tiffins × ${formatMoney(q.perTiffin, currency)}`,
    subtotal: round2(q.tiffins * q.perTiffin),
    lines: q.lines,
    total: q.saving,
    ...(named && q.eats ? { note: q.eats } : {}),
  };
}

/**
 * The advertised saving, worked out from live discounts so the promo can never claim more than
 * checkout gives. "Save over $X" holds for the typical (median) meal size on EVERY schedule at
 * the shortest plan of `minWeeks` or more; the receipt shows that weakest case.
 */
export function promoSavings(snapshot: CatalogSnapshot, coupon: CouponLike | null, currency: string, minWeeks = 8): PromoSavings | null {
  const sizes = listableMealSizes(snapshot.mealSizes).filter((m) => !m.trial && m.priceable)
    .sort((a, b) => effectivePrice(a.basePrice, a) - effectivePrice(b.basePrice, b));
  const weeks = snapshot.durations.map((d) => d.weeks).filter((w) => w >= minWeeks).sort((a, b) => a - b)[0];
  if (sizes.length === 0 || weeks == null) return null;
  const typical = sizes[Math.floor((sizes.length - 1) / 2)]!;

  const weakest = snapshot.frequencies
    .map((f) => quote(snapshot, typical.publicId, f.key, weeks, coupon, currency))
    .filter((q): q is Quote => q != null)
    .sort((a, b) => a.saving - b.saving)[0];
  if (!weakest || weakest.saving < 5) return null;

  // Most any plan gets: dearest size, longest plan, best schedule.
  const longest = Math.max(...snapshot.durations.map((d) => d.weeks));
  // The receipt that stacks the most discounts wins (then the bigger saving): every offer shows up
  // on one real plan, and the bar, tag and list all quote that same plan.
  const best = snapshot.frequencies
    .map((f) => quote(snapshot, sizes.at(-1)!.publicId, f.key, longest, coupon, currency, true))
    .filter((q): q is Quote => q != null)
    .sort((a, b) => b.lines.length - a.lines.length || b.saving - a.saving)[0];
  // Plan length first, then the schedule, then the code: the order a visitor builds a plan in.
  const rank = (l: PromoLine) => (l.label.startsWith("Code ") ? 2 : l.perk?.endsWith("plans") ? 0 : 1);
  const perks = (best?.lines ?? []).filter((l) => l.figure && l.perk).sort((a, b) => rank(a) - rank(b));

  // Strictly under the real figure, rounded to $5, so "over" is always true.
  const floor = Math.ceil(weakest.saving / 5) * 5 - 5;
  return {
    headline: `Save over ${formatMoney(floor, currency, { whole: true })}`,
    condition: `on ${weeks}+ week plans`,
    example: `${weakest.weeks} weeks, ${weakest.frequency}`,
    subtotalLabel: `${weakest.tiffins} tiffins × ${formatMoney(weakest.perTiffin, currency)}`,
    subtotal: round2(weakest.tiffins * weakest.perTiffin),
    lines: weakest.lines,
    total: weakest.saving,
    upTo: best && best.saving > weakest.saving ? best.saving : null,
    best: best && best.saving > weakest.saving ? receipt(best, currency, true) : null,
    perks,
  };
}
