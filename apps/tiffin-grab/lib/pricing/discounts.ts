// Pure, dependency-free discount resolution (moves to @foundry/discounts verbatim).
export interface DiscountRule {
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

export interface DiscountLine {
  key: string;
  kind: string;
  percent: number;
  /** percent after cap scaling */
  effectivePercent: number;
  amount: number;
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export function applicableRules(rules: DiscountRule[], ctx: DiscountContext): DiscountRule[] {
  return rules.filter(
    (r) =>
      r.percent > 0 &&
      (r.minWeeks == null || ctx.weeks >= r.minWeeks) &&
      (r.targetKey == null || r.targetKey === ctx.targets[r.kind]),
  );
}

// Largest-remainder split of targetCents over exact (fractional) cent shares: every share >= 0 and
// the sum is exactly targetCents, unlike dumping the rounding residual on the last line.
function allocateCents(exact: number[], targetCents: number): number[] {
  const out = exact.map((e) => Math.max(0, Math.floor(e + 1e-9)));
  let diff = targetCents - out.reduce((s, c) => s + c, 0);
  const order = exact.map((e, i) => i).sort((a, b) => (exact[b] - Math.floor(exact[b])) - (exact[a] - Math.floor(exact[a])));
  for (let k = 0; diff > 0 && order.length; k++, diff--) out[order[k % order.length]] += 1;
  for (let k = 0; diff < 0 && order.length; k++) {
    const i = order[k % order.length];
    if (out[i] > 0) { out[i] -= 1; diff++; }
  }
  return out;
}

// Sum-then-cap: percents add up, the SUM is capped at maxDiscountPct, each line is scaled
// proportionally and the last line absorbs rounding so lines sum exactly to the capped total.
export function resolveCatalogDiscounts(
  rules: (Pick<DiscountRule, "key" | "percent"> & { kind?: string })[],
  opts: { tiffinSubtotal: number; maxDiscountPct: number },
): { lines: DiscountLine[]; totalPercent: number; capped: boolean } {
  const live = rules.filter((r) => r.percent > 0);
  const rawPct = live.reduce((s, r) => s + r.percent, 0);
  const totalPercent = Math.min(rawPct, opts.maxDiscountPct);
  const scale = rawPct > 0 ? totalPercent / rawPct : 0;
  const targetCents = Math.round(round2(opts.tiffinSubtotal * (totalPercent / 100)) * 100);
  const cents = allocateCents(live.map((r) => opts.tiffinSubtotal * r.percent * scale), targetCents);
  const lines = live.map((r, i) => ({ key: r.key, kind: r.kind ?? "", percent: r.percent, effectivePercent: r.percent * scale, amount: cents[i] / 100 }));
  return { lines, totalPercent, capped: rawPct > opts.maxDiscountPct };
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
