import type { ReactNode } from "react";
import { UsersIcon } from "lucide-react";
import { PageShell, PageHeader, SectionCard } from "@/components/ds";
import { SectionDateRange } from "@/components/filters/section-date-range";

// Everything on the Customer groups page that needs no data. The page fills the slots with
// Suspense around real data; loading.tsx fills them with skeletons, so both paint the same frame.
export function CustomerGroupsChrome({ actions, stats, list }: { actions: ReactNode; stats: ReactNode; list: ReactNode }) {
  return (
    <PageShell>
      <PageHeader icon={UsersIcon} title="Customer groups" actions={actions} />
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionDateRange />
        </div>
        {stats}
      </div>
      <SectionCard title="All groups" subtitle="Saved sets of customers. Pick one from Give coins, Campaigns or Coupons to act on it. A text search spans all dates.">
        {list}
      </SectionCard>
    </PageShell>
  );
}
