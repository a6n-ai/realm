const BRANDS: Record<string, string> = { visa: "Visa", mastercard: "Mastercard", amex: "Amex", discover: "Discover", diners: "Diners Club", jcb: "JCB", unionpay: "UnionPay" };

export function cardBrandLabel(brand: string | null): string {
  if (!brand) return "Card";
  const key = brand.toLowerCase();
  return BRANDS[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
}

const METHODS: Record<string, string> = { stripe: "Card", etransfer: "e-Transfer", cash: "Cash", manual: "Recorded by staff", simulated: "Test payment" };

/** "Visa ••4242" for a card with known digits, otherwise the method's name. */
export function paymentMethodLabel(p: { method: string; cardBrand: string | null; cardLast4: string | null }): string {
  if (p.method === "stripe" && p.cardLast4) return `${cardBrandLabel(p.cardBrand)} ••${p.cardLast4}`;
  return METHODS[p.method] ?? p.method;
}
