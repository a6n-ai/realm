export const CURRENCIES = ["CAD", "SGD", "USD", "EUR", "GBP", "AUD", "INR"] as const;
export type AppCurrency = (typeof CURRENCIES)[number];

export function isIanaTimeZone(tz: string): boolean {
  try {
    Intl.DateTimeFormat("en", { timeZone: tz });
    return tz.length > 0;
  } catch {
    return false;
  }
}
