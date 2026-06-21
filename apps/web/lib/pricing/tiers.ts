import { ValidationError } from "@tiffin/commons";

export interface PricingTier {
  minQty: number;
  maxQty: number | null; // null = unbounded top band
  upliftPct: number;
}

// Active tiers must form a contiguous cover of 1..∞: sorted by minQty, the first
// starts at 1, each next minQty is exactly prev.maxQty + 1, and exactly one band
// (the last) is unbounded. Uplift must be non-negative.
export function assertValidTiers(tiers: PricingTier[]): void {
  if (tiers.length === 0) throw new ValidationError("No pricing tiers configured");
  const sorted = [...tiers].sort((a, b) => a.minQty - b.minQty);
  if (sorted[0].minQty !== 1) throw new ValidationError("Pricing tiers must start at quantity 1");

  for (let i = 0; i < sorted.length; i++) {
    const t = sorted[i];
    if (t.upliftPct < 0) throw new ValidationError("Pricing tier uplift cannot be negative");
    const isLast = i === sorted.length - 1;
    if (isLast) {
      if (t.maxQty !== null) throw new ValidationError("The top pricing tier must be unbounded (no max)");
    } else {
      if (t.maxQty === null) throw new ValidationError("Only the top pricing tier may be unbounded");
      if (t.maxQty < t.minQty) throw new ValidationError("Pricing tier max must be ≥ min");
      // Next band must start exactly one above this band's max: a smaller value is an overlap, a larger value is a gap.
      if (sorted[i + 1].minQty !== t.maxQty + 1) throw new ValidationError("Pricing tiers must be contiguous (no gaps or overlaps)");
    }
  }
}

export function findTier(tiers: PricingTier[], qty: number): PricingTier {
  const match = tiers.find((t) => qty >= t.minQty && (t.maxQty === null || qty <= t.maxQty));
  if (!match) throw new ValidationError(`No pricing tier matches quantity ${qty}`);
  return match;
}
