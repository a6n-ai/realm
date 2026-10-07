import type { ReactNode } from "react";
import { WalletCardsIcon } from "lucide-react";
import { PageHeader, PageShell } from "@foundry/design-system";
import { requireAdmin } from "@/lib/auth/guards";
import { PaymentsTabs } from "./payments-tabs";

export default async function PaymentsLayout({ children }: { children: ReactNode }) {
  await requireAdmin();

  return (
    <PageShell>
      <PageHeader
        icon={WalletCardsIcon}
        title="Payments"
        subtitle="Booking payments. E-transfers and cash stay pending until you verify them. Methods live under Settings → Payment."
      />
      <PaymentsTabs />
      <div className="min-w-0">{children}</div>
    </PageShell>
  );
}
