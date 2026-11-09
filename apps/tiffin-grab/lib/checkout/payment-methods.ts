import { enabledMethods } from "@foundry/payments";
import { getPaymentConfig } from "@/lib/services/app-settings.service";
import { stripeMethodAvailable } from "@/lib/payments/stripe";

export interface CheckoutPaymentMethod {
  id: string;
  label: string;
  instructions?: string;
  payeeHandle?: string;
  requireProof?: boolean;
}

// Card is offered only while Stripe is actually usable, so a half-configured account never strands a customer.
export async function checkoutRails(cfg: Awaited<ReturnType<typeof getPaymentConfig>>) {
  const card = await stripeMethodAvailable();
  return enabledMethods(cfg).filter((m) => m.id === "cash" || m.id === "etransfer" || (m.id === "stripe" && card));
}

export async function checkoutPaymentMethods(cfg?: Awaited<ReturnType<typeof getPaymentConfig>>): Promise<CheckoutPaymentMethod[]> {
  return (await checkoutRails(cfg ?? (await getPaymentConfig()))).map((m) => ({
    id: m.id,
    label: m.label,
    instructions: m.instructions,
    payeeHandle: m.payeeHandle,
    requireProof: m.requireProof,
  }));
}
