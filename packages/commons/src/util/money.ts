const DEFAULT_LOCALE = "en-CA";
const DEFAULT_CURRENCY = "CAD";

// Canonical currency formatter. Defaults to Canadian English / CAD (the only
// client today); pass currency + locale when a client needs otherwise.
export function formatMoney(
  amount: number,
  currency: string = DEFAULT_CURRENCY,
  locale: string = DEFAULT_LOCALE,
): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount);
}
