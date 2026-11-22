import { TicketPercentIcon } from "lucide-react";
import { PageHeader, PageShell, SectionCard } from "@/components/ds";
import { DiscountCapSkeleton } from "./discount-cap-form";
import { AllDiscountsSkeleton } from "./all-discounts-table";

export default function Loading() {
  return (
    <div aria-busy="true" className="contents">
      <PageShell>
        <PageHeader icon={TicketPercentIcon} title="Discounts" />
        <SectionCard title="Discount cap">
          <DiscountCapSkeleton />
        </SectionCard>
        <SectionCard title="All discounts" subtitle="Discounts take money off the food; waivers remove fees or cover the tax.">
          <AllDiscountsSkeleton />
        </SectionCard>
      </PageShell>
    </div>
  );
}
