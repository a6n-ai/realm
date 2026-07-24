import type { LucideIcon } from "lucide-react";
import { BanknoteIcon, CreditCardIcon, HandCoinsIcon } from "lucide-react";
import type { PaymentMethodConfig } from "@realm/payments";

/** Installable payment plugins. Stripe etc. land here later. */
export type PaymentPluginDef = {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  /** Seed row written into payment_config when the plugin is installed. */
  seed: () => PaymentMethodConfig;
};

export const PAYMENT_PLUGIN_CATALOG: readonly PaymentPluginDef[] = [
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

export function findPaymentPlugin(id: string): PaymentPluginDef | undefined {
  return PAYMENT_PLUGIN_CATALOG.find((p) => p.id === id);
}
