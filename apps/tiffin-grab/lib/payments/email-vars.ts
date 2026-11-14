import { cardBrandLabel } from "@/lib/billing/payment-labels";
import { formatMoney } from "@foundry/commons";
import { paymentMethodLabel } from "@/lib/payments/method-label";
import type { payments } from "@/db/schema";

/** Receipt extras for payment_approved: card fee, taxes (Stripe Tax lines included), the card used and the total charged. */
export function receiptVars(
  pay: Pick<typeof payments.$inferSelect, "method" | "amount" | "cardBrand" | "cardLast4" | "surchargeAmount">,
  taxLines: { name: string; ratePct: number; amount: number }[],
) {
  const isCard = pay.method === "stripe";
  const fee = isCard ? Number(pay.surchargeAmount) : 0;
  const total = isCard ? formatMoney(Number(pay.amount) + fee) : "";
  const brand = cardBrandLabel(pay.cardBrand);
  const parts = [
    ...taxLines.map((t) => `${t.name} ${t.ratePct}%: ${formatMoney(t.amount)}`),
    fee > 0 ? `Card fee ${formatMoney(fee)}` : null,
    isCard ? `Total charged ${total}` : null,
  ].filter(Boolean);
  return {
    receiptLines: parts.join(" · "),
    paidWith: isCard && pay.cardLast4 ? `${brand} •••• ${pay.cardLast4}` : paymentMethodLabel(pay.method, "full"),
    cardFee: fee > 0 ? formatMoney(fee) : "",
    totalCharged: total,
  };
}

/** Shared `{{payment.*}}` template variables for the payment_* customer emails. */
export function paymentTemplateVars(
  pay: Pick<typeof payments.$inferSelect, "amount" | "method">,
  orderCode: string,
  customerName: string | null | undefined,
) {
  return {
    amount: formatMoney(Number(pay.amount)),
    orderCode,
    customerName: customerName || "there",
    method: paymentMethodLabel(pay.method, "full"),
  };
}
