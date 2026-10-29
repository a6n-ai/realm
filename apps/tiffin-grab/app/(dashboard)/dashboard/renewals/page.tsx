import { Suspense } from "react";
import Link from "next/link";
import { CalendarClockIcon, CalendarX2Icon, HourglassIcon, RefreshCwIcon, WalletIcon } from "lucide-react";
import { zonedDateIso } from "@foundry/commons";
import { Button } from "@foundry/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@foundry/ui/tabs";
import { PageShell, PageHeader, SectionCard } from "@/components/ds";
import { StatCards, StatCardsSkeleton } from "@/components/dashboard/stat-cards";
import { requirePermission } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { resolveSessionVisibleOrgIds } from "@/lib/services/orders.service";
import { countRenewals, listRenewals } from "@/lib/services/renewals.service";
import { ENDED_DAYS, ENDING_DAYS, parseRenewalsFilter, renewalsQuery, type RenewalsFilter } from "@/lib/renewals/filters";
import { RenewalsList, RenewalsListSkeleton } from "./renewals-list";

type SearchParams = Promise<Record<string, string | undefined>>;

const PAGE_SIZE = 50;
// The lapsed card counts over the picked "Ended" window, or the last 30 days when none is picked.
const DEFAULT_LAPSED_DAYS = 30;

async function scope() {
  await requirePermission({ order: ["read"] });
  const [visible, { timezone }] = await Promise.all([resolveSessionVisibleOrgIds(await getSession()), getAppSettings()]);
  // eslint-disable-next-line react-hooks/purity -- server component: reading the request clock is the point
  return { visible, today: zonedDateIso(Date.now(), timezone) };
}

export default async function RenewalsPage({ searchParams }: { searchParams: SearchParams }) {
  await requirePermission({ order: ["read"] });
  const sp = await searchParams;
  const f = parseRenewalsFilter(sp);
  const page = Math.max(0, Number(sp.page) || 0);
  // ListPagination writes ?page and ?size; cap the size so a hand-typed URL can't pull every row.
  const size = Math.min(200, Math.max(1, Number(sp.size) || PAGE_SIZE));
  return (
    <PageShell>
      <PageHeader icon={RefreshCwIcon} title="Renewals" subtitle="Plans ending soon or lapsed, and who already booked again." />
      <Tabs value={f.tab}>
        <TabsList variant="line" aria-label="Renewal lists">
          <TabsTrigger value="renewals" asChild>
            <Link href={`/dashboard/renewals${renewalsQuery({ ...f, tab: "renewals" })}`} prefetch={false}>Renewals</Link>
          </TabsTrigger>
          <TabsTrigger value="trials" asChild>
            <Link href={`/dashboard/renewals${renewalsQuery({ ...f, tab: "trials" })}`} prefetch={false}>Trial conversion</Link>
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <Suspense key={`${f.tab}:${f.ended}`} fallback={<StatCardsSkeleton count={4} cols={4} />}>
        <RenewalsCards f={f} />
      </Suspense>
      <SectionCard title={f.tab === "trials" ? "Trials" : "Plans"}>
        <div className="flex flex-col gap-4">
          <FilterBar f={f} />
          <Suspense key={`${renewalsQuery(f)}:${page}:${size}`} fallback={<RenewalsListSkeleton />}>
            <RenewalsData f={f} page={page} size={size} />
          </Suspense>
        </div>
      </SectionCard>
    </PageShell>
  );
}

async function RenewalsCards({ f }: { f: RenewalsFilter }) {
  const { visible, today } = await scope();
  const lapsedDays = f.ended ?? DEFAULT_LAPSED_DAYS;
  const c = await countRenewals(visible, f.tab, today, lapsedDays);
  const noun = f.tab === "trials" ? "trials" : "plans";
  return (
    <StatCards
      cols={4}
      items={[
        { label: "Ending today", value: c.endingToday, icon: CalendarClockIcon, hint: `Last tiffin today` },
        { label: "Ending within 7 days", value: c.endingWithin7, icon: HourglassIcon, hint: `Running ${noun}, today included` },
        {
          label: f.tab === "trials" ? "Not converted" : "Lapsed",
          value: c.lapsed,
          icon: CalendarX2Icon,
          hint: `Ended in the last ${lapsedDays} days, no later plan`,
          tone: c.lapsed > 0 ? "bad" : "ok",
        },
        { label: "Booked, not paid", value: c.renewedNotPaid, icon: WalletIcon, hint: "Next plan unpaid or waitlisted" },
      ]}
    />
  );
}

/** Two pill rows that write the URL; the server reads them back with parseRenewalsFilter. */
function FilterBar({ f }: { f: RenewalsFilter }) {
  const pill = (label: string, active: boolean, next: RenewalsFilter) => (
    <Button key={label} asChild size="sm" variant={active ? "secondary" : "ghost"} aria-pressed={active}>
      <Link href={`/dashboard/renewals${renewalsQuery(next)}`} prefetch={false} scroll={false}>{label}</Link>
    </Button>
  );
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Ending within">
        <span className="text-muted-foreground w-24 text-xs">Ending within</span>
        {ENDING_DAYS.map((d) => pill(d === 0 ? "Today" : `${d} ${d === 1 ? "day" : "days"}`, f.ending === d, { ...f, ending: d }))}
        {f.ended != null && pill("Off", f.ending == null, { ...f, ending: null })}
      </div>
      <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Ended in the last">
        <span className="text-muted-foreground w-24 text-xs">Ended in last</span>
        {ENDED_DAYS.map((d) => pill(`${d} days`, f.ended === d, { ...f, ended: d }))}
        {f.ended != null && pill("Off", false, { ...f, ended: null })}
      </div>
    </div>
  );
}

async function RenewalsData({ f, page, size }: { f: RenewalsFilter; page: number; size: number }) {
  const { visible, today } = await scope();
  const result = await listRenewals(visible, f, today, { page, size });
  return <RenewalsList rows={result.items} total={result.total} page={page} size={size} tab={f.tab} today={today} />;
}
