import type { ReactNode } from "react";
import { WalletCardsIcon } from "lucide-react";
import { PageShell, PageHeader } from "@/components/ds";
import { requirePagePermission } from "@/lib/auth/guards";

// This guard is the effective gate for every tab (Stripe's own check is only finance:read), so it stays despite the header wait.
export default async function PaymentsLayout({ children }: { children: ReactNode }) {
  await requirePagePermission({ finance: ["manage"] });
  return (
    <PageShell>
      <PageHeader
        icon={WalletCardsIcon}
        title="Payments"
        subtitle="Money in, by provider. E-transfers stay on hold until you approve them."
      />
      {children}
    </PageShell>
  );
}
