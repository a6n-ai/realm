import type { ReactNode } from "react";
import { TicketPercentIcon } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { PageHeader } from "@/components/ds";
import { DiscountsTabs } from "./discounts-tabs";

export default async function DiscountsLayout({ children }: { children: ReactNode }) {
  await requireAdmin();

  return (
    <div className="grid gap-6">
      <PageHeader icon={TicketPercentIcon} title="Discounts" />
      <DiscountsTabs />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
