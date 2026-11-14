import { formatMoney } from "@foundry/commons";

type Num = number | string | null | undefined;

export function currencySymbol(currency: string): string {
  return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-CA", { style: "currency", currency, currencyDisplay: "narrowSymbol" })
    .formatToParts(0)
    .find((p) => p.type === "currency")?.value ?? currency;
}

export function formatDiscount(c: { valuePct?: Num; valueAmount?: Num }, currency: string): string {
  if (c.valuePct != null) return `${Number(c.valuePct)}% off`;
  const amount = Number(c.valueAmount);
  return `${formatMoney(amount, currency, { whole: Number.isInteger(amount) })} off`;
}
