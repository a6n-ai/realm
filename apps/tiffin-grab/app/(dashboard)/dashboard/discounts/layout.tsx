import type { ReactNode } from "react";
import { TicketPercentIcon } from "lucide-react";
import { requirePermission } from "@/lib/auth/guards";
import { PageShell, PageHeader } from "@/components/ds";
import { SectionDateRange } from "@/components/filters/section-date-range";
import { DiscountsTabs } from "./discounts-tabs";

export default async function DiscountsLayout({ children }: { children: ReactNode }) {
  await requirePermission({ discount: ["read"] });

  return (
    <PageShell>
      <PageHeader icon={TicketPercentIcon} title="Discounts" />
      <DiscountsTabs />
      <SectionDateRange />
      <div className="min-w-0">{children}</div>
    </PageShell>
  );
}
