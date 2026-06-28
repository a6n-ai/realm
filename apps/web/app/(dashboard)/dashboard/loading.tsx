import { PageShell, PageHeader, SectionCard, SkeletonStatCards, SkeletonTable } from "@/components/ds";
import { LayoutDashboardIcon } from "lucide-react";

export default function Loading() {
  return (
    <PageShell>
      <PageHeader
        icon={LayoutDashboardIcon}
        title="Overview"
        subtitle="Operational snapshot across orders and members."
      />
      <SkeletonStatCards count={4} />
      <SectionCard title="Recent orders" subtitle="The latest plans deployed through checkout.">
        <SkeletonTable columns={5} />
      </SectionCard>
    </PageShell>
  );
}
