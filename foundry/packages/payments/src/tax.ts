import type { TaxLine } from "./config";

export type ComputedTaxLine = { name: string; ratePct: number; amount: number };
export type TaxBreakdown = { lines: ComputedTaxLine[]; taxTotal: number };

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// Tax applies to `taxableBase` (subtotal − discount, clamped ≥ 0). Each line is rounded to
// cents on its own; taxTotal sums the rounded lines so it matches the printed receipt.
export function computeTax(taxableBase: number, taxes: TaxLine[]): TaxBreakdown {
  const base = Math.max(0, taxableBase);
  const lines: ComputedTaxLine[] = taxes.map((t) => ({
    name: t.name,
    ratePct: t.ratePct,
    amount: round2(base * (t.ratePct / 100)),
  }));
  const taxTotal = round2(lines.reduce((sum, l) => sum + l.amount, 0));
  return { lines, taxTotal };
}
