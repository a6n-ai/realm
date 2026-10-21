import type { ReactNode } from "react";
import { WalletCardsIcon } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { PageShell, PageHeader } from "@/components/ds";
import { SectionDateRange } from "@/components/filters/section-date-range";
import { PaymentsTabs } from "./payments-tabs";

export default async function PaymentsLayout({ children }: { children: ReactNode }) {
  await requireAdmin();

  return (
    <PageShell>
      <PageHeader
        icon={WalletCardsIcon}
        title="Payments"
        subtitle="Money in, by provider. E-transfers stay on hold until you approve them."
      />
      <PaymentsTabs />
      <SectionDateRange />
      <div className="flex min-w-0 flex-col gap-6">{children}</div>
    </PageShell>
  );
}
