import { Suspense } from "react";
import { PackageIcon, ActivityIcon, CalendarClockIcon, RefreshCwIcon, CircleXIcon } from "lucide-react";
import { zonedDateIso } from "@foundry/commons";
import { db } from "@/db/client";
import { leadSources, leadSubsources, plans } from "@/db/schema";
import { requireStaff } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import { after } from "next/server";
import { expireUnpaidStripeOrders } from "@/lib/services/stripe-expiry";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { countFreeTiffinOrders, countPaymentReviewOrders, countLookOutOrders, countMigratedWaiting, listOrdersPage, resolveSessionVisibleOrgIds } from "@/lib/services/orders.service";
import { redirect } from "next/navigation";
import { canReassign } from "@/lib/services/reassign";
import { listAssignableStaff } from "@/lib/services/assignable-staff";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { orderFormCatalog } from "./order-form-catalog";
import { dishCategoriesService } from "@/lib/services/dish-categories.service";
import { parseSort } from "@/lib/list/sort";
import { Skeleton } from "@foundry/ui/skeleton";
import {
  PageShell,
  PageHeader,
  SectionCard,
  parseFilterState,
  type FacetDef,
} from "@/components/ds";
import { SectionDateRange } from "@/components/filters/section-date-range";
import { withDefaultMonth, withListDates } from "@/lib/list/default-month";
import { OrdersList, OrdersListSkeleton } from "./orders-list";
import { OrdersViewTabs } from "./orders-view-tabs";
import { getOrdersOverview } from "@/lib/services/orders-stats.service";
import { OrderTagsLegend } from "./row-tags";
import { StatCards, StatCardsSkeleton, type StatCardItem } from "@/components/dashboard/stat-cards";
import { MissedList } from "./missed-list";
import { countMissedDeliveries, listMissedDeliveries } from "@/lib/services/missed-deliveries.service";
import { filterMissedRows, MISSED_DAYS, MISSED_WHY } from "@/lib/missed-filter";
import { ORDER_STATUS_PILLS, ongoingFilter } from "./status-pills";
import { and } from "@foundry/commons/model/condition";
import { NewOrderSheet } from "./new-order-sheet";
import { StartMigratedDialog } from "./start-migrated-dialog";

type SearchParams = Promise<Record<string, string | undefined>>;

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const raw = await searchParams;
  // Ending soon moved to Renewals; keep old bookmarks working.
  if (raw.view === "ending") redirect("/dashboard/renewals?ending=2");
  return (
    <PageShell>
      <PageHeader
        icon={PackageIcon}
        title="Orders"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Suspense fallback={null}>
              <StartMigratedAction />
            </Suspense>
            <Suspense fallback={<Skeleton className="h-9 w-32" />}>
              <NewOrderAction />
            </Suspense>
          </div>
        }
      />
      {/* The date range filters the cards: one group, tighter than the page rhythm. */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionDateRange />
          <OrderTagsLegend />
        </div>
        <Suspense fallback={<StatCardsSkeleton count={5} />}>
          <OrdersStats searchParams={searchParams} />
        </Suspense>
      </div>
      <Suspense fallback={<Skeleton className="h-9 w-56" />}>
        <OrdersViews />
      </Suspense>
      <SectionCard title="Orders">
        <Suspense fallback={<OrdersListSkeleton />}>
          <OrdersData searchParams={searchParams} />
        </Suspense>
      </SectionCard>
    </PageShell>
  );
}

// Only while WordPress plans are waiting to be started; gone once the switch-over is done.
async function StartMigratedAction() {
  await requireStaff();
  const waiting = await countMigratedWaiting();
  return waiting > 0 ? <StartMigratedDialog waiting={waiting} /> : null;
}

async function OrdersViews() {
  await requireStaff();
  const visible = await resolveSessionVisibleOrgIds(await getSession());
  const [lookOutCount, missedCount, paymentReviewCount, freeCount] = await Promise.all([
    countLookOutOrders(visible),
    countMissedDeliveries(visible),
    countPaymentReviewOrders(visible),
    countFreeTiffinOrders(visible),
  ]);
  return <OrdersViewTabs lookOutCount={lookOutCount} missedCount={missedCount} paymentReviewCount={paymentReviewCount} freeCount={freeCount} />;
}

async function OrdersStats({ searchParams }: { searchParams: SearchParams }) {
  await requireStaff();
  const sp = await withDefaultMonth(await searchParams);
  const range = { from: Number(sp.from), to: Number(sp.to) };
  const o = await getOrdersOverview(range, await resolveSessionVisibleOrgIds(await getSession()));

  const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "—");

  const stats: StatCardItem[] = [
    {
      label: "New orders",
      value: o.newOrders.count,
      icon: PackageIcon,
      hint: `${o.newOrders.count - o.newOrders.returning} first-time · ${o.newOrders.returning} returning`,
      delta: { now: o.newOrders.count, before: o.newOrders.prevCount, good: "up" },
    },
    {
      label: "Starting soon",
      value: o.startingSoon.count,
      icon: CalendarClockIcon,
      hint: `Next 7 days · ${o.startingSoon.unpaid} unpaid · ${o.startingSoon.waitlisted} waitlisted`,
    },
    { label: "Running plans", value: o.running.count, icon: ActivityIcon, hint: `${o.running.trials} on trial · right now` },
    {
      label: "Renewal rate",
      value: pct(o.renewals.renewed, o.renewals.ended),
      icon: RefreshCwIcon,
      hint: `${o.renewals.renewed} of ${o.renewals.ended} plans that ended booked again`,
    },
    {
      label: "Cancelled",
      value: o.cancelled.count,
      icon: CircleXIcon,
      hint: `${o.cancelled.prevCount} in the previous period`,
      delta: { now: o.cancelled.count, before: o.cancelled.prevCount, good: "down" },
    },
  ];

  return <StatCards items={stats} />;
}

async function OrdersData({ searchParams }: { searchParams: SearchParams }) {
  await requireStaff();
  after(() => expireUnpaidStripeOrders({}));

  const raw = await searchParams;
  if (raw.view === "missed") {
    const [session, { timezone }] = await Promise.all([getSession(), getAppSettings()]);
    const all = await listMissedDeliveries(await resolveSessionVisibleOrgIds(session));
    // eslint-disable-next-line react-hooks/purity -- server component: reading the request clock is the point
    const today = zonedDateIso(Date.now(), timezone);
    const rows = filterMissedRows(all, raw, today);
    const spec: FacetDef[] = [
      { kind: "pills", field: "why", label: "Why", options: Object.entries(MISSED_WHY).map(([value, label]) => ({ value, label })) },
      { kind: "select", field: "day", label: "Day", options: [...MISSED_DAYS] },
      { kind: "search", fields: ["customerName", "orderCode", "planName"] },
    ];
    return <MissedList rows={rows} anyMissed={all.length > 0} spec={spec} isAdmin={session?.user?.role === "admin"} today={today} />;
  }
  const lookOutOnly = raw.view === "lookout";
  const paymentReview = raw.view === "payment";
  const freeTiffins = raw.view === "free";
  // A flagged, unpaid or missed-day order stays on its tab however old it is. The date picker
  // writes the current month onto every URL, so the bounds are dropped here, not just left unset.
  const sp = lookOutOnly || paymentReview || freeTiffins || raw.missed === "yes" ? { ...raw, from: undefined, to: undefined } : await withListDates(raw);
  const sort = parseSort(
    sp,
    ["name", "status", "start", "total", "created"],
    // The Look out for tab leads with the newest flag, however old the order is.
    lookOutOnly ? { column: "flagged", dir: "desc" } : { column: "created", dir: "desc" },
  );

  const planOptions = await db
    .select({ value: plans.key, label: plans.name })
    .from(plans)
    .orderBy(plans.name);

  const spec: FacetDef[] = [
    {
      kind: "pills",
      field: "status",
      label: "Status",
      options: ORDER_STATUS_PILLS.map((p) => ({ value: p.value, label: p.label })),
    },
    { kind: "select", field: "plan", label: "Plan", options: planOptions },
    {
      kind: "select",
      field: "tier",
      label: "Meal size",
      options: [
        { value: "budget", label: "Budget" },
        { value: "medium", label: "Medium" },
        { value: "premium", label: "Premium" },
      ],
    },
    { kind: "dateRange", field: "createdAt", label: "Created" },
    {
      kind: "select",
      field: "missed",
      label: "Deliveries",
      options: [{ value: "yes", label: "Has missed deliveries" }],
    },
    { kind: "search", fields: ["fullName", "deploymentId", "email"] },
  ];

  // "missed" isn't an orders column: strip it before parseFilterState and filter by subquery instead.
  const missedOnly = sp.missed === "yes";
  const { sp: filterSp, extra } = ongoingFilter({ ...sp, missed: undefined });
  const { condition, page } = parseFilterState(spec, filterSp);
  const finalCondition = extra ? and(...[condition, extra].filter((c) => c != null)) : condition;

  const session = await getSession();
  const visible = await resolveSessionVisibleOrgIds(session);
  // eslint-disable-next-line react-hooks/purity -- server component: reading the request clock is the point
  const missedAsOf = missedOnly ? zonedDateIso(Date.now(), (await getAppSettings()).timezone) : undefined;

  const [result, reassignAllowed] = await Promise.all([
    listOrdersPage(finalCondition, page, sort, visible, {
      lookOutOnly,
      paymentReview,
      freeTiffins,
      missedAsOf,
    }),
    canReassign(),
  ]);
  const staff = reassignAllowed ? await listAssignableStaff() : [];

  return (
    <OrdersList
      spec={spec}
      rows={result.items}
      total={result.total}
      page={page.page}
      size={page.size}
      sort={sort}
      canReassign={reassignAllowed}
      staff={staff}
      lookOutView={lookOutOnly}
      paymentReviewView={paymentReview}
      freeTiffinsView={freeTiffins}
    />
  );
}

async function NewOrderAction() {
  await requireStaff();

  const [{ defaultCountry, currency }, sourceRows, subRows, catalog, slots, planKeys] = await Promise.all([
    getAppSettings(),
    db
      .select({ id: leadSources.id, key: leadSources.key, label: leadSources.label, active: leadSources.active })
      .from(leadSources),
    db
      .select({
        sourceId: leadSubsources.sourceId,
        key: leadSubsources.key,
        label: leadSubsources.label,
        active: leadSubsources.active,
      })
      .from(leadSubsources),
    loadCatalogSnapshot(),
    dishCategoriesService.enabledCategories(),
    dishCategoriesService.planKeysByCategoryKey(),
  ]);

  const sources = sourceRows
    .filter((s) => s.active)
    .map((s) => ({
      key: s.key,
      label: s.label,
      subs: subRows
        .filter((sub) => sub.active && sub.sourceId === s.id)
        .map((sub) => ({ key: sub.key, label: sub.label })),
    }));

  const orderCatalog = orderFormCatalog(catalog);

  return (
    <NewOrderSheet
      triggerLabel="New order"
      defaultCountry={defaultCountry}
      sources={sources}
      catalog={orderCatalog}
      currency={currency}
      categories={slots.map((s) => ({ key: s.key, label: s.label, tuUnitType: s.tuUnitType, tuUnitSize: Number(s.tuUnitSize), tuUnitLabel: s.tuUnitLabel, planKeys: planKeys.get(s.key) ?? [] }))}
    />
  );
}
