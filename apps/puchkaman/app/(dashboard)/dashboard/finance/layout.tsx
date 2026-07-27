import type { ReactNode } from "react";
import { BanknoteIcon } from "lucide-react";
import { PageHeader, PageShell } from "@realm/design-system";
import { requireAdmin } from "@/lib/auth/guards";
import { FinanceTabs } from "./finance-tabs";

export default async function FinanceLayout({ children }: { children: ReactNode }) {
  await requireAdmin();

  return (
    <PageShell>
      <PageHeader
        icon={BanknoteIcon}
        title="Finance"
        subtitle="Clover website order payments and money ledger."
      />
      <FinanceTabs />
      <div className="min-w-0">{children}</div>
    </PageShell>
  );
}
