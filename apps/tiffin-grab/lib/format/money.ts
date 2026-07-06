// Amounts are stored in minor units + a companion currency code; format via Intl.
export function formatMoney(amountMinor: number, currency: string): string {
  const locale = currency === "INR" ? "en-IN" : "en-US";
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amountMinor / 100);
}
