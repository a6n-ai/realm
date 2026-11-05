import { listableMealSizes, type CatalogSnapshot } from "@/lib/catalog/types";
import { buildPricingCatalog } from "@/lib/pricing/build-catalog";
import { postCatalogSubtotal } from "@/lib/pricing/discounts";
import { priceSubscription } from "@/lib/pricing/engine";
import { effectivePrice } from "@/lib/pricing/meal-size-discount";
import type { PromoSavings } from "@/lib/landing/promo-types";

type CouponLike = { code: string; valuePct: string | null; valueAmount: string | null; minSubtotal: string | null };

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const money = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;

// "3 Days/Wk Alternate (MWF)" reads as "Mon, Wed, Fri" on a receipt line.
const DAY = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" } as Record<string, string>;
function frequencyName(snapshot: CatalogSnapshot, key: string): string {
  const f = snapshot.frequencies.find((x) => x.key === key)!;
  const days = f.weekdays ?? [];
  if (days.length === 5 && days.join() === "mon,tue,wed,thu,fri") return "Mon to Fri";
  return days.length > 0 ? days.map((d) => DAY[d] ?? d).join(", ") : f.name;
}

interface Quote { lines: { label: string; amount: number }[]; tiffins: number; perTiffin: number; frequency: string; weeks: number; saving: number }

/** Prices one plan through the checkout engine, then the coupon on what is left, as checkout does. */
function quote(snapshot: CatalogSnapshot, mealSizeId: string, frequencyKey: string, weeks: number, coupon: CouponLike | null): Quote | null {
  const size = snapshot.mealSizes.find((m) => m.publicId === mealSizeId)!;
  const plan = snapshot.plans.find((p) => p.key === size.planKey);
  const slot = plan?.offeredSlots[0];
  if (!slot) return null;
  const selections = { mealSizeId, frequencyKey, persons: 1, mealSlots: [slot], includeSaturday: false, includeSunday: false, durationWeeks: weeks, startDate: "2000-01-03" };
  let priced;
  try {
    priced = priceSubscription(selections, buildPricingCatalog(snapshot, selections));
  } catch {
    return null;
  }
  // Short receipt labels; admin names like "Delivery schedule discount - 3 Days/Wk Alternate (MWF)" wrap on a phone.
  const rule = new Map((snapshot.discounts ?? []).map((d) => [d.key, d]));
  const lines = priced.adjustments.filter((a) => a.amount > 0).map((a) => {
    const d = a.discountKey ? rule.get(a.discountKey) : undefined;
    const label = d?.kind === "delivery" ? `${frequencyName(snapshot, frequencyKey)} (${d.percent}%)` : d?.kind === "duration" ? `${weeks}-week plan (${d.percent}%)` : a.label;
    return { label, amount: a.amount };
  });
  const left = postCatalogSubtotal(priced.subtotal, priced.adjustments);
  if (coupon && left >= Number(coupon.minSubtotal ?? 0)) {
    const pct = Number(coupon.valuePct ?? 0);
    const amount = round2(Math.min(left, pct > 0 ? (left * pct) / 100 : Number(coupon.valueAmount ?? 0)));
    if (amount > 0) lines.push({ label: `Code ${coupon.code}`, amount });
  }
  return { lines, tiffins: priced.tiffinCount, perTiffin: priced.perTiffinPrice, frequency: frequencyName(snapshot, frequencyKey), weeks, saving: round2(lines.reduce((s, l) => s + l.amount, 0)) };
}

/**
 * The advertised saving, worked out from live discounts so the promo can never claim more than
 * checkout gives. "Save over $X" holds for the typical (median) meal size on EVERY schedule at
 * the shortest plan of `minWeeks` or more; the receipt shows that weakest case.
 */
export function promoSavings(snapshot: CatalogSnapshot, coupon: CouponLike | null, minWeeks = 8): PromoSavings | null {
  const sizes = listableMealSizes(snapshot.mealSizes).filter((m) => !m.trial && m.priceable)
    .sort((a, b) => effectivePrice(a.basePrice, a) - effectivePrice(b.basePrice, b));
  const weeks = snapshot.durations.map((d) => d.weeks).filter((w) => w >= minWeeks).sort((a, b) => a - b)[0];
  if (sizes.length === 0 || weeks == null) return null;
  const typical = sizes[Math.floor((sizes.length - 1) / 2)]!;

  const weakest = snapshot.frequencies
    .map((f) => quote(snapshot, typical.publicId, f.key, weeks, coupon))
    .filter((q): q is Quote => q != null)
    .sort((a, b) => a.saving - b.saving)[0];
  if (!weakest || weakest.saving < 5) return null;

  // Most any plan gets: dearest size, longest plan, best schedule.
  const longest = Math.max(...snapshot.durations.map((d) => d.weeks));
  const best = snapshot.frequencies
    .map((f) => quote(snapshot, sizes[sizes.length - 1]!.publicId, f.key, longest, coupon)?.saving ?? 0)
    .reduce((a, b) => Math.max(a, b), 0);

  // Strictly under the real figure, rounded to $5, so "over" is always true.
  const floor = Math.ceil(weakest.saving / 5) * 5 - 5;
  return {
    headline: `Save over ${money(floor)}`,
    condition: `on ${weeks}+ week plans`,
    example: `${weakest.weeks} weeks, ${weakest.frequency}`,
    subtotalLabel: `${weakest.tiffins} tiffins × ${money(weakest.perTiffin)}`,
    subtotal: round2(weakest.tiffins * weakest.perTiffin),
    lines: weakest.lines,
    total: weakest.saving,
    upTo: best > weakest.saving ? best : null,
  };
}
