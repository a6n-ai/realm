import type { ReactNode } from "react";
import { PackageIcon } from "lucide-react";
import { PageShell, PageHeader, SectionCard } from "@/components/ds";
import { SectionDateRange } from "@/components/filters/section-date-range";
import { OrderTagsLegend } from "./row-tags";

// Everything on the Orders page that needs no data. The page fills the slots with Suspense
// around real data; loading.tsx fills them with skeletons, so both paint the same frame.
export function OrdersChrome({
  newOrder,
  startMigrated,
  dateNote,
  stats,
  next,
  tabs,
  listSubtitle,
  showLegend = true,
  list,
}: {
  newOrder: ReactNode;
  startMigrated?: ReactNode;
  dateNote?: ReactNode;
  stats: ReactNode;
  next: ReactNode;
  tabs: ReactNode;
  listSubtitle?: string;
  showLegend?: boolean;
  list: ReactNode;
}) {
  return (
    <PageShell>
      <PageHeader
        icon={PackageIcon}
        title="Orders"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {startMigrated}
            {newOrder}
          </div>
        }
      />
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <SectionDateRange />
            {dateNote}
          </div>
        </div>
        {stats}
      </div>
      {next}
      {tabs}
      <SectionCard title="Orders" subtitle={listSubtitle} action={showLegend ? <OrderTagsLegend /> : undefined}>
        {list}
      </SectionCard>
    </PageShell>
  );
}
