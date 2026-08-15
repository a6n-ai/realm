import type { ReactNode } from "react";
import { BanknoteIcon } from "lucide-react";
import { PageHeader, PageShell } from "@realm/design-system";
import { requirePermission } from "@/lib/auth/guards";
import { FinanceTabs } from "./finance-tabs";

export default async function FinanceLayout({ children }: { children: ReactNode }) {
  await requirePermission({ finance: ["read"] });

  return (
    <PageShell>
      <PageHeader
        icon={BanknoteIcon}
        title="Finance"
        subtitle="Order payments and money ledger."
      />
      <FinanceTabs />
      <div className="min-w-0">{children}</div>
    </PageShell>
  );
}
