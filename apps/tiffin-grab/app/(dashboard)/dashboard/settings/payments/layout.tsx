import type { ReactNode } from "react";
import { CreditCardIcon } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { PageHeader } from "@/components/ds";
import { getPaymentConfig } from "@/lib/services/app-settings.service";
import { PaymentTabs } from "./payment-tabs";

export default async function PaymentsSettingsLayout({ children }: { children: ReactNode }) {
  await requireAdmin();
  const cfg = await getPaymentConfig();

  return (
    <div className="grid gap-6">
      <PageHeader
        icon={CreditCardIcon}
        title="Payment"
        subtitle="Settings for payment plugins installed under Integrations."
      />
      <PaymentTabs
        methods={cfg.methods.map((m) => ({ id: m.id, label: m.label }))}
      />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
