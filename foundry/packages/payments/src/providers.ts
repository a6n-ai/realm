import type { LucideIcon } from "lucide-react";
import { BanknoteIcon, CreditCardIcon, HandCoinsIcon } from "lucide-react";
import type { PaymentMethodConfig } from "./config";

/**
 * A payment provider inside the Payments plugin (Settings → Payments).
 * Providers are NOT Integrations cards — Payments is the single plugin.
 */
export type PaymentProviderDef = {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  /**
   * Plugin id that must be installed for this provider to be available,
   * e.g. "clover" for the Clover Payment provider. Unused by the three
   * manual providers; first consumer lands with Clover Payment.
   */
  requiresPlugin?: string;
  /** Seed row written into payment_config when the provider is installed. */
  seed: () => PaymentMethodConfig;
};

export const PAYMENT_PROVIDERS: readonly PaymentProviderDef[] = [
  {
    id: "etransfer",
    label: "Interac e-Transfer",
    description: "Customers send an e-Transfer; staff verifies the claim.",
    icon: BanknoteIcon,
    seed: () => ({
      id: "etransfer",
      kind: "manual",
      enabled: false,
      label: "Interac e-Transfer",
      taxes: [],
    }),
  },
  {
    id: "cash",
    label: "Cash on delivery",
    description: "Collect cash at the door; optional photo proof on claim.",
    icon: HandCoinsIcon,
    seed: () => ({
      id: "cash",
      kind: "manual",
      enabled: false,
      label: "Cash on delivery",
      taxes: [],
    }),
  },
  {
    id: "manual",
    label: "Manual / Other",
    description: "Custom instructions for bank transfer, cheque, etc.",
    icon: CreditCardIcon,
    seed: () => ({
      id: "manual",
      kind: "manual",
      enabled: false,
      label: "Manual / Other",
      taxes: [],
    }),
  },
];

export function findPaymentProvider(id: string): PaymentProviderDef | undefined {
  return PAYMENT_PROVIDERS.find((p) => p.id === id);
}
