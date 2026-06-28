import { PageShell, PageHeader, SectionCard, SkeletonTable } from "@/components/ds";
import { UtensilsCrossedIcon } from "lucide-react";

// Worst-case (active order + published menu): the meals grid. Empty-state
// variants resolve fast enough that this brief grid placeholder is harmless.
export default function Loading() {
  return (
    <PageShell>
      <PageHeader icon={UtensilsCrossedIcon} title="My Meals" />
      <SectionCard title="Coming week">
        <SkeletonTable columns={4} rows={7} />
      </SectionCard>
    </PageShell>
  );
}
