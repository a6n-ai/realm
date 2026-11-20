import type { ReactNode } from "react";
import Link from "next/link";
import { UsersIcon } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@foundry/ui/tabs";
import { PageShell, PageHeader, SectionCard } from "@/components/ds";
import { DateByPicker } from "@/components/filters/date-by-picker";
import { SectionDateRange } from "@/components/filters/section-date-range";
import { CUSTOMER_DATE_BY } from "@/lib/customers/customer-list-keys";

// Switching tabs keeps the date range and search; sort and page belong to the other table.
export function customersTabHref(sp: Record<string, string | undefined>, tab: string) {
  const qs = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => e[1] != null && !["tab", "sort", "dir", "page"].includes(e[0])));
  if (tab !== "all") qs.set("tab", tab);
  const q = qs.toString();
  return `/dashboard/customers${q ? `?${q}` : ""}`;
}

// Everything on the Customers page that needs no data. The page fills the slots with Suspense
// around real data; loading.tsx fills them with skeletons, so both paint the same frame.
export function CustomersChrome({
  lead,
  actions,
  dateBy = "joined",
  stats,
  tab = "all",
  showPayments,
  searchParams = {},
  listAction,
  list,
}: {
  lead?: ReactNode;
  actions: ReactNode;
  dateBy?: "joined" | "ordered";
  stats: ReactNode;
  tab?: "all" | "payments";
  /** The page passes `canFinance`. Loading shows the tab anyway: the page falls back to All without finance:read. */
  showPayments: boolean;
  searchParams?: Record<string, string | undefined>;
  listAction?: ReactNode;
  list: ReactNode;
}) {
  return (
    <PageShell>
      {lead}
      <PageHeader icon={UsersIcon} title="Customers" actions={actions} />
      {/* The date range filters the cards: one group, tighter than the page rhythm. */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <DateByPicker value={dateBy} options={CUSTOMER_DATE_BY} />
          <SectionDateRange />
        </div>
        {stats}
      </div>
      <Tabs value={tab}>
        <TabsList variant="line" aria-label="Customer lists">
          <TabsTrigger value="all" render={<Link href={customersTabHref(searchParams, "all")} prefetch={false} />}>
            All customers
          </TabsTrigger>
          {showPayments && (
            <TabsTrigger value="payments" render={<Link href={customersTabHref(searchParams, "payments")} prefetch={false} />}>
              Payments
            </TabsTrigger>
          )}
        </TabsList>
      </Tabs>
      <SectionCard title={tab === "payments" ? "Customer payments" : "All customers"} action={listAction}>
        {list}
      </SectionCard>
    </PageShell>
  );
}
