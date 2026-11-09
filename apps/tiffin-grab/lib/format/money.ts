type MoneyOpts = { whole?: boolean; narrow?: boolean };

// Amounts are major units. INR keeps Indian digit grouping; everything else
// uses en-CA so CAD renders "$1.00" and not "CA$1.00".
export function formatMoney(amount: number, currency: string, { whole, narrow }: MoneyOpts = {}): string {
  return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-CA", {
    style: "currency",
    currency,
    ...(whole && { maximumFractionDigits: 0 }),
    ...(narrow && { currencyDisplay: "narrowSymbol" }),
  }).format(amount);
}
