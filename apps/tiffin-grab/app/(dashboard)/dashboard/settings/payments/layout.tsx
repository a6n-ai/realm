import type { ReactNode } from "react";
import Link from "next/link";
import { CreditCardIcon, ReceiptIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PaymentTabs
          methods={cfg.methods.map((m) => ({ id: m.id, label: m.label }))}
        />
        {/* Order-level money rules apply regardless of which provider is installed,
            so this lives beside the per-method tabs rather than inside one. */}
        <Button asChild variant="outline" size="sm" className="gap-1.5">
          <Link href="/dashboard/settings/payments/checkout-rules" prefetch={false}>
            <ReceiptIcon className="size-3.5" />
            Tax &amp; coins
          </Link>
        </Button>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
