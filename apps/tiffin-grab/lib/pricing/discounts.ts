import { round2 } from "@foundry/commons/util/money";

export interface AppDiscountRule {
  key: string;
  kind: string;
  percent: number;
  /** null = applies to every target of this kind */
  targetKey: string | null;
  minWeeks: number | null;
  /** delivery only: needs at least this many eating days. Tiers resolve to the highest one reached, never stacking. */
  minEatingDays: number | null;
}

export interface DiscountContext {
  /** the selected target's key per kind, e.g. { delivery: "frq_x", duration: "dur_y" } */
  targets: Record<string, string | undefined>;
  weeks: number;
  eatingDays: number;
}

// Within each (kind, target) group only the highest eating-day tier survives; untiered rows are never dropped.
function keepTopTier<T>(rows: T[], group: (r: T) => string, min: (r: T) => number | null): T[] {
  const top = new Map<string, number>();
  for (const r of rows) {
    const m = min(r);
    if (m != null) top.set(group(r), Math.max(top.get(group(r)) ?? 0, m));
  }
  return rows.filter((r) => min(r) == null || min(r) === top.get(group(r)));
}

export function applicableRules(rules: AppDiscountRule[], ctx: DiscountContext): AppDiscountRule[] {
  const met = rules.filter(
    (r) =>
      r.percent > 0 &&
      (r.minWeeks == null || ctx.weeks >= r.minWeeks) &&
      (r.minEatingDays == null || ctx.eatingDays >= r.minEatingDays) &&
      (r.targetKey == null || r.targetKey === ctx.targets[r.kind]),
  );
  return keepTopTier(met, (r) => `${r.kind}:${r.targetKey ?? ""}`, (r) => r.minEatingDays);
}

interface CatalogDiscountLike { kind: string; targetPublicId: string | null; percent: number; minWeeks: number | null; minEatingDays?: number | null }

// Display-only badge sum, clamped to maxPct (the pricing-time cap) when given. Eating-day tiers resolve to the
// highest one reached; the default 7 shows the best case.
export function savePct(discounts: CatalogDiscountLike[] | undefined, kind: "delivery" | "duration", targetPublicId: string, weeks = 0, maxPct?: number, eatingDays = 7): number {
  const met = (discounts ?? [])
    // A 1-week minimum covers every plan, so it counts even when the length isn't chosen yet (weeks = 0): the
    // frequency cards call this before the duration step and showed no "Save 5%" for prod's MWF discount.
    .filter((d) => d.kind === kind && d.percent > 0 && (d.targetPublicId == null || d.targetPublicId === targetPublicId) && (d.minWeeks == null || d.minWeeks <= 1 || weeks >= d.minWeeks) && (d.minEatingDays == null || eatingDays >= d.minEatingDays));
  const sum = keepTopTier(met, (d) => d.targetPublicId ?? "", (d) => d.minEatingDays ?? null).reduce((s, d) => s + d.percent, 0);
  return maxPct == null ? sum : Math.min(sum, maxPct);
}

export function hasEatingTiers(discounts: CatalogDiscountLike[] | undefined, targetPublicId: string): boolean {
  return (discounts ?? []).some((d) => d.kind === "delivery" && d.percent > 0 && d.minEatingDays != null && (d.targetPublicId == null || d.targetPublicId === targetPublicId));
}

// Subtotal left after catalog discount lines; coupons and coins apply on top of this, never the pre-discount subtotal.
export function postCatalogSubtotal(subtotal: number, catalogAdjustments: { amount: number }[]): number {
  return Math.max(0, round2(subtotal - catalogAdjustments.reduce((s, a) => s + a.amount, 0)));
}
