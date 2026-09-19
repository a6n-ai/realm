import { round2 } from "@foundry/discounts";

export interface AppDiscountRule {
  key: string;
  kind: string;
  percent: number;
  /** null = applies to every target of this kind */
  targetKey: string | null;
  minWeeks: number | null;
}

export interface DiscountContext {
  /** the selected target's key per kind, e.g. { delivery: "frq_x", duration: "dur_y" } */
  targets: Record<string, string | undefined>;
  weeks: number;
}

export function applicableRules(rules: AppDiscountRule[], ctx: DiscountContext): AppDiscountRule[] {
  return rules.filter(
    (r) =>
      r.percent > 0 &&
      (r.minWeeks == null || ctx.weeks >= r.minWeeks) &&
      (r.targetKey == null || r.targetKey === ctx.targets[r.kind]),
  );
}

interface CatalogDiscountLike { kind: string; targetPublicId: string | null; percent: number; minWeeks: number | null }

// Display-only badge sum, clamped to maxPct (the pricing-time cap) when given.
export function savePct(discounts: CatalogDiscountLike[] | undefined, kind: "delivery" | "duration", targetPublicId: string, weeks = 0, maxPct?: number): number {
  const sum = (discounts ?? [])
    .filter((d) => d.kind === kind && d.percent > 0 && (d.targetPublicId == null || d.targetPublicId === targetPublicId) && (d.minWeeks == null || weeks >= d.minWeeks))
    .reduce((s, d) => s + d.percent, 0);
  return maxPct == null ? sum : Math.min(sum, maxPct);
}

// Subtotal left after catalog discount lines; coupons and coins apply on top of this, never the pre-discount subtotal.
export function postCatalogSubtotal(subtotal: number, catalogAdjustments: { amount: number }[]): number {
  return Math.max(0, round2(subtotal - catalogAdjustments.reduce((s, a) => s + a.amount, 0)));
}
