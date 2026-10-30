import { Suspense } from "react";
import Link from "next/link";
import { CalendarCheckIcon, CalendarX2Icon, HourglassIcon, PackageIcon, RefreshCwIcon, WalletIcon } from "lucide-react";
import { zonedDateIso } from "@foundry/commons";
import { Tabs, TabsList, TabsTrigger } from "@foundry/ui/tabs";
import { PageShell, PageHeader, SectionCard, parseFilterState, type FacetDef } from "@/components/ds";
import { StatCards, StatCardsSkeleton } from "@/components/dashboard/stat-cards";
import { requirePermission } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { resolveSessionVisibleOrgIds } from "@/lib/services/orders.service";
import { countRenewals, listRenewals, listRenewedCustomers, type RenewalRange } from "@/lib/services/renewals.service";
import { SectionDateRange } from "@/components/filters/section-date-range";
import { withListDates } from "@/lib/list/default-month";
import { DateByPicker } from "./date-by-picker";
import { DATE_BY, ENDED_DAYS, ENDING_DAYS, RENEWAL_STATUSES, RENEWED_DAYS, statusLabel, parseRenewalsFilter, renewalsQuery, type RenewalsFilter } from "@/lib/renewals/filters";
import { RenewalFactsLegend } from "./fact-tags";
import { RenewalsList, RenewalsListSkeleton, RenewedCustomersList, RenewedCustomersListSkeleton } from "./renewals-list";

type SearchParams = Promise<Record<string, string | undefined>>;

async function scope() {
  await requirePermission({ order: ["read"] });
  const [visible, { timezone }] = await Promise.all([resolveSessionVisibleOrgIds(await getSession()), getAppSettings()]);
  // eslint-disable-next-line react-hooks/purity -- server component: reading the request clock is the point
  return { visible, timezone, today: zonedDateIso(Date.now(), timezone) };
}

/** The top range on its chosen date: ISO days in the app timezone for tiffin dates, epoch ms for the order date. */
function resolveRange(f: RenewalsFilter, timezone: string): RenewalRange {
  return {
    by: f.dateBy,
    fromMs: f.from,
    toMs: f.to,
    fromIso: f.from != null ? zonedDateIso(f.from, timezone) : null,
    toIso: f.to != null ? zonedDateIso(f.to, timezone) : null,
  };
}

export default async function RenewalsPage({ searchParams }: { searchParams: SearchParams }) {
  await requirePermission({ order: ["read"] });
  // Same date rules as Orders: this month by default, and a text search spans all dates.
  const sp = await withListDates(await searchParams);
  const f = parseRenewalsFilter(sp);
  const spec = facetSpec(f);
  // Same page/size rules as every other list (default 25, sizes 10/25/50/100).
  const { page } = parseFilterState(spec, sp);
  return (
    <PageShell>
      <PageHeader icon={RefreshCwIcon} title="Renewals" subtitle="Plans ending soon or lapsed, and who already booked again." />
      {/* The date range filters the cards and the list: one group, tighter than the page rhythm. */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {f.tab !== "customers" && <DateByPicker value={f.dateBy} options={DATE_BY} />}
          <SectionDateRange />
        </div>
        <Suspense key={`${f.tab}:${f.dateBy}:${f.from}:${f.to}`} fallback={<StatCardsSkeleton count={5} />}>
          <RenewalsCards f={f} />
        </Suspense>
      </div>
      <Tabs value={f.tab}>
        <TabsList variant="line" aria-label="Renewal lists">
          <TabsTrigger value="renewals" asChild>
            <Link href={`/dashboard/renewals${renewalsQuery({ ...f, tab: "renewals", status: null, renewed: null })}`} prefetch={false}>Renewals</Link>
          </TabsTrigger>
          <TabsTrigger value="trials" asChild>
            <Link href={`/dashboard/renewals${renewalsQuery({ ...f, tab: "trials", status: null, renewed: null })}`} prefetch={false}>Trial conversion</Link>
          </TabsTrigger>
          <TabsTrigger value="customers" asChild>
            <Link href={`/dashboard/renewals${renewalsQuery({ ...f, tab: "customers", ending: null, ended: null, status: null })}`} prefetch={false}>Renewed customers</Link>
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <SectionCard
        title={f.tab === "customers" ? "Customers who renewed" : f.tab === "trials" ? "Trials" : "Plans"}
        action={f.tab === "customers" ? undefined : <RenewalFactsLegend />}
      >
        <Suspense
          key={`${renewalsQuery(f)}:${page.page}:${page.size}`}
          fallback={f.tab === "customers" ? <RenewedCustomersListSkeleton /> : <RenewalsListSkeleton />}
        >
          {f.tab === "customers" ? (
            <RenewedCustomersData f={f} page={page.page} size={page.size} spec={spec} />
          ) : (
            <RenewalsData f={f} page={page.page} size={page.size} spec={spec} />
          )}
        </Suspense>
      </SectionCard>
    </PageShell>
  );
}

/** The standard facet bar under the top date range: Ending / Ended windows, Status and search. */
function facetSpec(f: RenewalsFilter): FacetDef[] {
  if (f.tab === "customers") {
    return [
      { kind: "select", field: "renewed", label: "Renewed in last", options: RENEWED_DAYS.map((d) => ({ value: String(d), label: `${d} days` })) },
      { kind: "search", fields: ["name", "phone", "email"] },
    ];
  }
  return [
    { kind: "select", field: "ending", label: "Ending within", options: ENDING_DAYS.map((d) => ({ value: String(d), label: d === 0 ? "Today" : `${d} ${d === 1 ? "day" : "days"}` })) },
    { kind: "select", field: "ended", label: "Ended in last", options: ENDED_DAYS.map((d) => ({ value: String(d), label: `${d} days` })) },
    { kind: "pills", field: "status", label: "Status", options: RENEWAL_STATUSES.map((s) => ({ value: s, label: statusLabel(s, f.tab) })) },
    { kind: "search", fields: ["fullName", "deploymentId", "phone"] },
  ];
}

async function RenewalsCards({ f }: { f: RenewalsFilter }) {
  const { visible, today, timezone } = await scope();
  // The renewed-customers tab keeps the paid-plan cards above it.
  const trials = f.tab === "trials";
  const c = await countRenewals(visible, trials ? "trials" : "renewals", today, resolveRange(f, timezone));
  const noun = trials ? "trials" : "plans";
  return (
    <StatCards
      items={[
        { label: trials ? "Trials" : "Plans", value: c.plans, icon: PackageIcon, hint: `Running or finished ${noun} in this range` },
        { label: trials ? "Converted" : "Renewed", value: c.renewed, icon: CalendarCheckIcon, hint: "Next plan paid or running" },
        { label: "Booked, not paid", value: c.renewedNotPaid, icon: WalletIcon, hint: "Next plan unpaid or waitlisted" },
        { label: trials ? "Not converted" : "Not renewed", value: c.notRenewed, icon: HourglassIcon, hint: "Still running, nothing booked after" },
        {
          label: "Lapsed",
          value: c.lapsed,
          icon: CalendarX2Icon,
          hint: "Ended, nothing booked after",
          ...(c.lapsed > 0 ? { tone: "bad" as const } : {}),
        },
      ]}
    />
  );
}

async function RenewalsData({ f, page, size, spec }: { f: RenewalsFilter; page: number; size: number; spec: FacetDef[] }) {
  const { visible, today, timezone } = await scope();
  const result = await listRenewals(visible, f, today, { page, size }, resolveRange(f, timezone));
  return <RenewalsList rows={result.items} total={result.total} page={page} size={size} tab={f.tab} today={today} spec={spec} />;
}

async function RenewedCustomersData({ f, page, size, spec }: { f: RenewalsFilter; page: number; size: number; spec: FacetDef[] }) {
  const { visible, today } = await scope();
  const result = await listRenewedCustomers(visible, { renewedWithin: f.renewed, q: f.q, from: f.from, to: f.to }, { page, size });
  return <RenewedCustomersList rows={result.items} total={result.total} page={page} size={size} today={today} spec={spec} />;
}
