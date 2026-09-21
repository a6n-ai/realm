import type { ReactNode } from "react";
import { BanknoteIcon } from "lucide-react";
import { PageHeader } from "@foundry/design-system";
import { PAYMENTS_PLUGIN_ID } from "@foundry/payments/plugin";
import { requireAdmin } from "@/lib/auth/guards";
import { ensurePaymentCatalog, getIntegrationsConfig } from "@/lib/services/app-settings.service";
import { PaymentTabs } from "./payment-tabs";

export default async function PaymentsSettingsLayout({ children }: { children: ReactNode }) {
  await requireAdmin();
  const [integrations] = await Promise.all([getIntegrationsConfig(), ensurePaymentCatalog()]);
  const flag = integrations[PAYMENTS_PLUGIN_ID] as { installed?: boolean } | undefined;
  const active = Boolean(flag?.installed);

  return (
    <div className="grid gap-6">
      <PageHeader
        icon={BanknoteIcon}
        title="Payment"
        subtitle={
          active
            ? "Cash on delivery is on by default. e-Transfer is optional. Card payments come later via Stripe."
            : "Activate Payments under Integrations to collect booking fees. Method tabs stay available either way."
        }
      />
      <PaymentTabs />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
