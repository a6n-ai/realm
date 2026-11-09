import type { payments } from "@/db/schema";

export type PaymentMethod = (typeof payments.method.enumValues)[number];

/** full: emails and the order payments panel. short: staff tables, filters and the Today feed. customer: the customer's own bills. */
const LABELS = {
  full: { etransfer: "Interac e-Transfer", cash: "Cash", manual: "Manual", simulated: "Simulated", stripe: "Card (Stripe)" },
  short: { etransfer: "e-Transfer", cash: "Cash", manual: "Manual", simulated: "Simulated", stripe: "Card" },
  customer: { etransfer: "e-Transfer", cash: "Cash", manual: "Recorded by staff", simulated: "Test payment", stripe: "Card" },
} as const satisfies Record<string, Record<PaymentMethod, string>>;

/** The method's name, or the raw value for a method this build does not know. */
export const paymentMethodLabel = (method: string, variant: keyof typeof LABELS = "short"): string =>
  (LABELS[variant] as Record<string, string>)[method] ?? method;
