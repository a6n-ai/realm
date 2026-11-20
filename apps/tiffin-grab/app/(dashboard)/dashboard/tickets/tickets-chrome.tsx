import type { ReactNode } from "react";
import { LifeBuoyIcon } from "lucide-react";
import { PageShell, PageHeader, SectionCard } from "@/components/ds";
import { SectionDateRange } from "@/components/filters/section-date-range";

// Everything on the Tickets page that needs no data. The page fills the slots with Suspense
// around real data; loading.tsx fills them with skeletons, so both paint the same frame.
export function TicketsChrome({ lead, actions, stats, list }: { lead?: ReactNode; actions?: ReactNode; stats: ReactNode; list: ReactNode }) {
  return (
    <PageShell>
      {lead}
      <PageHeader icon={LifeBuoyIcon} title="Tickets" actions={actions} />
      {/* The date range filters the cards: one group, tighter than the page rhythm. */}
      <div className="flex flex-col gap-3">
        <div className="flex">
          <SectionDateRange />
        </div>
        {stats}
      </div>
      <SectionCard title="All tickets">{list}</SectionCard>
    </PageShell>
  );
}
