import type { ReactNode } from "react";
import { WalletCardsIcon } from "lucide-react";
import { requirePagePermission } from "@/lib/auth/guards";
import { PageShell, PageHeader } from "@/components/ds";

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
