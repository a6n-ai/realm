/**
 * Local tax forecast for the cart.
 *
 * This is a PREVIEW ONLY. Clover computes the tax that is actually charged
 * (`POST /v1/orders/{id}/pay` bills the Clover order's total), so nothing here is
 * ever authoritative — see `checkoutAtomicOrder`. The point of computing it locally
 * is to show the customer a total before we round-trip to Clover.
 *
 * Behaviour mirrored from the live merchant, verified by probe:
 *  - discounts apply BEFORE tax
 *  - tax is computed per rate on the summed discounted net, then rounded once
 *    (1698c net x 13% = 220.74 -> 221), matching Clover's `taxSummaries` grouping
 *  - an item with `defaultTaxRates` uses the merchant's `isDefault` rates; an item
 *    with explicit associations uses only those
 */

/** Tax rate as mirrored from Clover. Percentage and flat are mutually exclusive. */
export type TaxRateRow = {
  /** Clover id — the only safe key. Names are duplicated across different rates. */
  cloverTaxRateId: string;
  name: string;
  /** Percent, e.g. "13.00000". Null for flat-amount taxes. */
  rate: string | number | null;
  /** Flat tax in cents. Null for percentage taxes. */
  taxAmount: number | null;
  isDefault: boolean;
};

export type TaxableLine = {
  /** Line total in dollars, before discount. */
  lineTotal: number;
  quantity: number;
  /** Clover `defaultTaxRates` flag on the product. */
  useDefaultRates: boolean;
  /** Clover tax rate ids explicitly associated with the product. */
  rateIds: string[];
};

export type TaxBreakdown = {
  /** Total tax in dollars. */
  tax: number;
  perRate: { cloverTaxRateId: string; name: string; amount: number }[];
};

const toCents = (dollars: number) => Math.round(dollars * 100);

/**
 * Which rates apply to a line. Explicit associations win; otherwise the merchant
 * defaults, but only when the product opts into them.
 */
function ratesForLine(line: TaxableLine, byId: Map<string, TaxRateRow>, defaults: TaxRateRow[]): TaxRateRow[] {
  if (line.rateIds.length) {
    return line.rateIds.map((id) => byId.get(id)).filter((r): r is TaxRateRow => r != null);
  }
  return line.useDefaultRates ? defaults : [];
}

export function computeTax(
  lines: TaxableLine[],
  rates: TaxRateRow[],
  discountAmount = 0,
): TaxBreakdown {
  const byId = new Map(rates.map((r) => [r.cloverTaxRateId, r]));
  const defaults = rates.filter((r) => r.isDefault);

  const subtotalCents = lines.reduce((s, l) => s + toCents(l.lineTotal), 0);
  const discountCents = Math.min(toCents(discountAmount), subtotalCents);

  // Accumulate the discounted base per rate, then round once per rate — rounding
  // each line first would drift from Clover (3 x 50c: 3x7=21 vs 19.5->20).
  const netByRate = new Map<string, number>();
  const flatByRate = new Map<string, number>();

  for (const line of lines) {
    const lineCents = toCents(line.lineTotal);
    // Spread the order-level discount across lines by value share, so the taxed
    // base matches the discounted cart Clover sees.
    const lineDiscount = subtotalCents > 0 ? Math.round((discountCents * lineCents) / subtotalCents) : 0;
    const netCents = Math.max(0, lineCents - lineDiscount);

    for (const rate of ratesForLine(line, byId, defaults)) {
      if (rate.taxAmount != null) {
        // Flat tax is charged per unit, not per line.
        flatByRate.set(
          rate.cloverTaxRateId,
          (flatByRate.get(rate.cloverTaxRateId) ?? 0) + rate.taxAmount * line.quantity,
        );
        continue;
      }
      netByRate.set(rate.cloverTaxRateId, (netByRate.get(rate.cloverTaxRateId) ?? 0) + netCents);
    }
  }

  const perRate: TaxBreakdown["perRate"] = [];
  let totalCents = 0;

  for (const [id, net] of netByRate) {
    const rate = byId.get(id);
    const percent = rate?.rate != null ? Number(rate.rate) : 0;
    if (!Number.isFinite(percent) || percent <= 0) continue;
    const amount = Math.round((net * percent) / 100);
    if (amount === 0) continue;
    totalCents += amount;
    perRate.push({ cloverTaxRateId: id, name: rate?.name ?? "", amount: amount / 100 });
  }

  for (const [id, amount] of flatByRate) {
    if (amount === 0) continue;
    totalCents += amount;
    perRate.push({ cloverTaxRateId: id, name: byId.get(id)?.name ?? "", amount: amount / 100 });
  }

  return { tax: totalCents / 100, perRate };
}
