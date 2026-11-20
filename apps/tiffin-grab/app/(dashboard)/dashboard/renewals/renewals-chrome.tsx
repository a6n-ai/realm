import type { ReactNode } from "react";
import Link from "next/link";
import { RefreshCwIcon } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@foundry/ui/tabs";
import { PageShell, PageHeader, SectionCard } from "@/components/ds";
import { DateByPicker } from "@/components/filters/date-by-picker";
import { SectionDateRange } from "@/components/filters/section-date-range";
import { DATE_BY, renewalsQuery, type RenewalsFilter } from "@/lib/renewals/filters";

// Everything on the Renewals page that needs no data. The page fills the slots with Suspense
// around real data; loading.tsx fills them with skeletons, so both paint the same frame.
// Tabs are all staff-visible (order:read, the page guard), so loading shows the same three.
export function RenewalsChrome({
  f,
  timezone,
  actions,
  stats,
  listAction,
  list,
}: {
  f: RenewalsFilter;
  timezone?: string;
  actions: ReactNode;
  stats: ReactNode;
  listAction?: ReactNode;
  list: ReactNode;
}) {
  const tab = f.tab === "customers" ? "customers" : f.type === "trial" ? "trials" : "renewals";
  const href = (next: RenewalsFilter) => `/dashboard/renewals${renewalsQuery(next, timezone)}`;
  return (
    <PageShell>
      <PageHeader icon={RefreshCwIcon} title="Renewals" subtitle="Plans ending soon or lapsed, and who already booked again." actions={actions} />
      {/* The date range filters the cards and the list: one group, tighter than the page rhythm. */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {f.tab !== "customers" && <DateByPicker value={f.dateBy} options={DATE_BY} />}
          <SectionDateRange />
        </div>
        {stats}
      </div>
      <Tabs value={tab}>
        <TabsList variant="line" aria-label="Renewal lists">
          <TabsTrigger value="renewals" render={<Link href={href({ ...f, tab: "renewals", type: "regular", status: null, renewed: null })} prefetch={false} />}>
            Renewals
          </TabsTrigger>
          <TabsTrigger value="trials" render={<Link href={href({ ...f, tab: "renewals", type: "trial", status: null, renewed: null })} prefetch={false} />}>
            Trial conversion
          </TabsTrigger>
          <TabsTrigger value="customers" render={<Link href={href({ ...f, tab: "customers", ending: null, ended: null, status: null, track: null, followUp: null })} prefetch={false} />}>
            Renewed customers
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <SectionCard title={tab === "customers" ? "Customers who renewed" : tab === "trials" ? "Trials" : "Plans"} action={listAction}>
        {list}
      </SectionCard>
    </PageShell>
  );
}
