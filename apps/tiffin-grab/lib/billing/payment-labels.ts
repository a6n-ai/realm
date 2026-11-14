import { paymentMethodLabel as methodName } from "@/lib/payments/method-label";

const BRANDS: Record<string, string> = { visa: "Visa", mastercard: "Mastercard", amex: "Amex", discover: "Discover", diners: "Diners Club", jcb: "JCB", unionpay: "UnionPay" };

export function cardBrandLabel(brand: string | null): string {
  if (!brand) return "Card";
  const key = brand.toLowerCase();
  return BRANDS[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function paymentMethodLabel(p: { method: string; cardBrand: string | null; cardLast4: string | null }): string {
  if (p.method === "stripe" && p.cardLast4) return `${cardBrandLabel(p.cardBrand)} ••${p.cardLast4}`;
  return methodName(p.method, "customer");
}
