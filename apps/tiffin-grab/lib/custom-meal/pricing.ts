import { ValidationError } from "@foundry/commons";
import type { CustomMealItem } from "./composition";

export type CustomMealPricingRow = { category: string; planKey: string; pricePerTu: number; maxTu: number | null };

// EPSILON: 14.625 * 100 is 1462.4999… in float, so plain Math.round rounds cents down.
export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function computeCustomPerTiffin(items: CustomMealItem[], rows: CustomMealPricingRow[]): number {
  if (items.length === 0) throw new ValidationError("A custom meal needs at least one item");
  const byKey = new Map(rows.map((r) => [`${r.category}:${r.planKey}`, r]));
  const tuTotals = new Map<string, number>();
  let total = 0;
  for (const item of items) {
    const key = `${item.category}:${item.planKey}`;
    const row = byKey.get(key);
    if (!row) throw new ValidationError(`${item.category} (${item.planKey}) isn't available in custom meals`);
    total += item.tuAmount * row.pricePerTu;
    tuTotals.set(key, (tuTotals.get(key) ?? 0) + item.tuAmount);
  }
  for (const [key, tu] of tuTotals) {
    const max = byKey.get(key)!.maxTu;
    if (max != null && tu > max + 1e-9) throw new ValidationError(`${key.replace(":", " (")}) can be at most ${max} TU per tiffin`);
  }
  return round2(total);
}
