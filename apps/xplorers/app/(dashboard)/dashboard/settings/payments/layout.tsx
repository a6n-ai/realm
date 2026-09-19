import type { ReactNode } from "react";
import { CreditCardIcon } from "lucide-react";
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
        icon={CreditCardIcon}
        title="Payment"
        subtitle={
          active
            ? "Enable a method and families can pay for a booking. Ledger is always here."
            : "Activate Payments under Integrations to collect booking fees. Tabs stay available either way."
        }
      />
      <PaymentTabs />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
