import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarCheckIcon, CalendarClockIcon, CalendarX2Icon, HourglassIcon, RefreshCwIcon, WalletIcon } from "lucide-react";
import { zonedDateIso } from "@foundry/commons";
import { Tabs, TabsList, TabsTrigger } from "@foundry/ui/tabs";
import { PageShell, PageHeader, SectionCard, parseFilterState, type FacetDef } from "@/components/ds";
import { StatCards, StatCardsSkeleton } from "@/components/dashboard/stat-cards";
import { requirePermission } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { resolveSessionVisibleOrgIds } from "@/lib/services/orders.service";
import { countRenewals, listRenewals, listRenewedCustomers } from "@/lib/services/renewals.service";
import { DEFAULT_ENDING, ENDED_DAYS, ENDING_DAYS, RENEWAL_STATUSES, RENEWED_DAYS, missingWindow, statusLabel, parseRenewalsFilter, renewalsQuery, type RenewalsFilter } from "@/lib/renewals/filters";
import { RenewalsList, RenewalsListSkeleton, RenewedCustomersList, RenewedCustomersListSkeleton } from "./renewals-list";

type SearchParams = Promise<Record<string, string | undefined>>;

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
  // Put the default window in the URL so the filter bar shows it as an applied filter.
  if (missingWindow(sp)) redirect(`/dashboard/renewals${renewalsQuery({ ...parseRenewalsFilter(sp), ending: DEFAULT_ENDING })}`);
  const f = parseRenewalsFilter(sp);
  const spec = facetSpec(f);
  // Same page/size rules as every other list (default 25, sizes 10/25/50/100).
  const { page } = parseFilterState(spec, sp);
  return (
    <PageShell>
      <PageHeader icon={RefreshCwIcon} title="Renewals" subtitle="Plans ending soon or lapsed, and who already booked again." />
      <Suspense key={`${f.tab}:${f.ended}`} fallback={<StatCardsSkeleton count={5} />}>
        <RenewalsCards f={f} />
      </Suspense>
      <Tabs value={f.tab}>
        <TabsList variant="line" aria-label="Renewal lists">
          <TabsTrigger value="renewals" asChild>
            <Link href={`/dashboard/renewals${renewalsQuery({ ...f, tab: "renewals", status: null })}`} prefetch={false}>Renewals</Link>
          </TabsTrigger>
          <TabsTrigger value="trials" asChild>
            <Link href={`/dashboard/renewals${renewalsQuery({ ...f, tab: "trials", status: null })}`} prefetch={false}>Trial conversion</Link>
          </TabsTrigger>
          <TabsTrigger value="customers" asChild>
            <Link href="/dashboard/renewals?tab=customers" prefetch={false}>Renewed customers</Link>
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <SectionCard title={f.tab === "customers" ? "Customers who renewed" : f.tab === "trials" ? "Trials" : "Plans"}>
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

/** The standard facet bar: two window selects, the renewal status, and search (renewed customers: when, and search). */
function facetSpec(f: RenewalsFilter): FacetDef[] {
  if (f.tab === "customers") {
    return [
      { kind: "select", field: "renewed", label: "Renewed in last", options: RENEWED_DAYS.map((d) => ({ value: String(d), label: `${d} days` })) },
      { kind: "dateRange", field: "createdAt", label: "Renewal ordered" },
      { kind: "search", fields: ["name", "phone", "email"] },
    ];
  }
  return [
    { kind: "select", field: "ending", label: "Ending within", options: ENDING_DAYS.map((d) => ({ value: String(d), label: d === 0 ? "Today" : `${d} ${d === 1 ? "day" : "days"}` })) },
    { kind: "select", field: "ended", label: "Ended in last", options: ENDED_DAYS.map((d) => ({ value: String(d), label: `${d} days` })) },
    { kind: "pills", field: "status", label: "Status", options: RENEWAL_STATUSES.map((s) => ({ value: s, label: statusLabel(s, f.tab) })) },
    { kind: "dateRange", field: "createdAt", label: "Ordered" },
    { kind: "search", fields: ["fullName", "deploymentId", "phone"] },
  ];
}

async function RenewalsCards({ f }: { f: RenewalsFilter }) {
  const { visible, today } = await scope();
  const lapsedDays = f.ended ?? DEFAULT_LAPSED_DAYS;
  // The renewed-customers tab keeps the paid-plan cards above it.
  const c = await countRenewals(visible, f.tab === "trials" ? "trials" : "renewals", today, lapsedDays);
  const trials = f.tab === "trials";
  const noun = trials ? "trials" : "plans";
  return (
    <StatCards
      items={[
        { label: "Ending today", value: c.endingToday, icon: CalendarClockIcon, hint: "Last tiffin today" },
        { label: "Ending within 7 days", value: c.endingWithin7, icon: HourglassIcon, hint: `Running ${noun}, today included` },
        { label: trials ? "Converted" : "Renewed", value: c.renewed, icon: CalendarCheckIcon, hint: "Next plan paid or running" },
        { label: "Booked, not paid", value: c.renewedNotPaid, icon: WalletIcon, hint: "Next plan unpaid or waitlisted" },
        {
          label: trials ? "Not converted" : "Lapsed",
          value: c.lapsed,
          icon: CalendarX2Icon,
          hint: `Ended in the last ${lapsedDays} days, no later plan`,
          ...(c.lapsed > 0 ? { tone: "bad" as const } : {}),
        },
      ]}
    />
  );
}

async function RenewalsData({ f, page, size, spec }: { f: RenewalsFilter; page: number; size: number; spec: FacetDef[] }) {
  const { visible, today } = await scope();
  const result = await listRenewals(visible, f, today, { page, size });
  return <RenewalsList rows={result.items} total={result.total} page={page} size={size} tab={f.tab} today={today} spec={spec} />;
}

async function RenewedCustomersData({ f, page, size, spec }: { f: RenewalsFilter; page: number; size: number; spec: FacetDef[] }) {
  const { visible, today } = await scope();
  const result = await listRenewedCustomers(visible, { renewedWithin: f.renewed, q: f.q, from: f.from, to: f.to }, { page, size });
  return <RenewedCustomersList rows={result.items} total={result.total} page={page} size={size} today={today} spec={spec} />;
}
