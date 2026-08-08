import { CreditCardIcon } from "lucide-react";
import type { PluginMeta } from "@realm/commons/plugin";

export const PAYMENTS_PLUGIN_ID = "payments" as const;

/** Client-safe catalog metadata. No secrets, no fetch, no store. */
export const PAYMENTS_PLUGIN: PluginMeta = {
  id: PAYMENTS_PLUGIN_ID,
  label: "Payments",
  description:
    "Accept payments. Configure providers — e-Transfer, cash, manual — under Settings → Payment.",
  icon: CreditCardIcon,
  settingsHref: "/dashboard/settings/payments",
};
