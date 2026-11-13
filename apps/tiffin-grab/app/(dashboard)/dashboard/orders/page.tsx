import { isAdmin } from "@/lib/auth/roles";
import { Suspense } from "react";
import { PackageIcon, ActivityIcon, CalendarClockIcon, CalendarOffIcon, RefreshCwIcon, CircleXIcon, FlagIcon, PlayCircleIcon, WalletIcon, ShieldCheckIcon, AlarmClockIcon, GiftIcon, TruckIcon, PackageCheckIcon, CalendarX2Icon, UsersIcon } from "lucide-react";
import { formatMoney, zonedDateIso } from "@foundry/commons";
import { requireStaff } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import { loadOrderFilterOptions, loadOwnerOptions } from "@/lib/list/facet-options";
import { after } from "next/server";
import { expireUnpaidStripeOrders } from "@/lib/services/stripe-expiry";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { listActiveLeadSources } from "@/lib/services/lead-sources.service";
import { countMigratedWaiting, listOrdersPage } from "@/lib/services/orders.service";
import { resolveSessionVisibleOrgIds } from "@/lib/auth/visible-orgs";
import { countLookOutOrders } from "@/lib/orders/look-out";
import { countFreeTiffinOrders, type FreeTiffinRange, countPaymentReviewOrders } from "@/lib/orders/queries";
import { redirect } from "next/navigation";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { orderFormCatalog } from "@/app/(dashboard)/dashboard/_order/order-form-catalog";
import { dishCategoriesService } from "@/lib/services/dish-categories.service";
import { parseSort } from "@foundry/design-system/list-sort";
import { Skeleton } from "@foundry/ui/skeleton";
import {
  PageShell,
  PageHeader,
  SectionCard,
  parseFilterState,
  type FacetDef,
} from "@/components/ds";
import { SectionDateRange } from "@/components/filters/section-date-range";
import { Tooltip, TooltipContent, TooltipTrigger } from "@foundry/ui/tooltip";
import { withDefaultMonth, withListDates } from "@/lib/list/default-month";
import { OrdersList, OrdersListSkeleton } from "./orders-list";
import { NextOrderSection } from "./next-order-section";
import { NextItemSkeleton } from "@/components/dashboard/next-item/next-item-card";
import { OrdersViewTabs } from "./orders-view-tabs";
import { getFreeTiffinStats, getLookOutStats, getOrdersOverview, getPaymentReviewStats } from "@/lib/services/orders-stats.service";
import { OrderTagsLegend } from "./row-tags";
import { StatCards, StatCardsSkeleton, type StatCardItem } from "@/components/dashboard/stat-cards";
import { MissedList } from "./missed-list";
import { countMissedDeliveries, listMissedDeliveries } from "@/lib/services/missed-deliveries.service";
import { filterMissedRows, MISSED_DAYS, MISSED_WHY } from "@/lib/missed-filter";
import { orderStatusFilter } from "@/lib/orders/status-pills";
import { buildOrdersSpec, STARTS_DAYS, STARTS_FIELD } from "./orders-spec";
import { and, between } from "@foundry/commons/model/condition";
import { ordersListHref } from "@/lib/list/orders-drill";
import { NewOrderSheet } from "./new-order-sheet";
import { StartMigratedDialog } from "./start-migrated-dialog";
import { addDaysIso } from "@foundry/commons/util/dates";
import { requestNow } from "@/lib/dates/request-now";

type SearchParams = Promise<Record<string, string | undefined>>;

// The work-queue tabs mark "ignores the date range" with an icon beside the date filter.
function listNote(view?: string) {
  if (view === "free") return "Orders created in the date range that were given free tiffins";
  return undefined;
}

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
          <div className="flex items-center gap-2">
            <SectionDateRange />
            {raw.view === "lookout" ||
            raw.view === "payment" ||
            raw.view === "missed" ||
            raw.status === "running" ||
            raw.status === "soon" ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <CalendarOffIcon className="text-muted-foreground size-4" aria-label="Filter ignored" />
                </TooltipTrigger>
                <TooltipContent>Created-date filter ignored for this view</TooltipContent>
              </Tooltip>
            ) : raw.cancelledAt === "1" ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <CalendarOffIcon className="text-muted-foreground size-4" aria-label="Dated by cancel" />
                </TooltipTrigger>
                <TooltipContent>Dated by cancel activity, not order created date</TooltipContent>
              </Tooltip>
            ) : null}
          </div>
        </div>
        <Suspense key={`${raw.view ?? "all"}:${raw.from}:${raw.to}`} fallback={<StatCardsSkeleton count={raw.view === "lookout" || raw.view === "payment" || raw.view === "missed" ? 4 : raw.view === "free" ? 3 : 5} />}>
          <OrdersStats searchParams={searchParams} />
        </Suspense>
      </div>
      <Suspense fallback={<NextItemSkeleton title="Next order" />}>
        <NextOrderSection searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={<Skeleton className="h-9 w-56" />}>
        <OrdersViews searchParams={searchParams} />
      </Suspense>
      <SectionCard title="Orders" subtitle={listNote(raw.view)} action={raw.view === "missed" ? undefined : <OrderTagsLegend />}>
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

/**
 * The Free tiffins cards follow the date range: free tiffins delivered so far inside it, the same count as
 * Analytics → Revenue. The list and its count go by order creation date, like the other lists. The work-queue tabs (Look out for, Payment review, Missed) stay on every date.
 */
async function freeRange(raw: Awaited<SearchParams>): Promise<FreeTiffinRange> {
  const [sp, { timezone }] = await Promise.all([withDefaultMonth(raw), getAppSettings()]);
  const today = zonedDateIso(requestNow(), timezone);
  const to = zonedDateIso(Number(sp.to), timezone);
  return { from: zonedDateIso(Number(sp.from), timezone), to: to < today ? to : today };
}

async function OrdersViews({ searchParams }: { searchParams: SearchParams }) {
  await requireStaff();
  const visible = await resolveSessionVisibleOrgIds(await getSession());
  const [lookOutCount, missedCount, paymentReviewCount, freeCount] = await Promise.all([
    countLookOutOrders(visible),
    countMissedDeliveries(visible),
    countPaymentReviewOrders(visible),
    countFreeTiffinOrders(visible, await withListDates(await searchParams)),
  ]);
  return <OrdersViewTabs lookOutCount={lookOutCount} missedCount={missedCount} paymentReviewCount={paymentReviewCount} freeCount={freeCount} />;
}

async function OrdersStats({ searchParams }: { searchParams: SearchParams }) {
  await requireStaff();
  const sp = await withDefaultMonth(await searchParams);
  const range = { from: Number(sp.from), to: Number(sp.to) };
  const visible = await resolveSessionVisibleOrgIds(await getSession());
  const view = (await searchParams).view;
  const dates = { from: sp.from, to: sp.to };
  if (view === "lookout") {
    const l = await getLookOutStats(visible, range);
    return (
      <StatCards
        items={[
          { label: "Flagged orders", value: l.flagged, icon: FlagIcon, hint: "Every date", href: ordersListHref({}, { view: "lookout" }) },
          {
            label: "Running",
            value: l.running,
            icon: PlayCircleIcon,
            hint: "Flagged and active or paused",
            href: ordersListHref({}, { view: "lookout", status: "running", clearDates: true }),
          },
          { label: "Unpaid", value: l.unpaid, icon: WalletIcon, hint: "Flagged with a payment still due" },
          { label: "Flagged this range", value: l.inRange, icon: CalendarClockIcon, hint: "Flagged inside the date range" },
        ]}
      />
    );
  }
  if (view === "payment") {
    const [count, p, { currency }] = await Promise.all([countPaymentReviewOrders(visible), getPaymentReviewStats(visible), getAppSettings()]);
    return (
      <StatCards
        items={[
          { label: "Orders", value: count, icon: PackageIcon, hint: "Waiting on a payment", href: ordersListHref({}, { view: "payment" }) },
          { label: "Amount owed", value: formatMoney(p.owed, currency), icon: WalletIcon, hint: "Across their open payments" },
          { label: "Needs review", value: p.needsReview, icon: ShieldCheckIcon, hint: "Claimed, staff to verify" },
          { label: "Overdue", value: p.overdue, icon: AlarmClockIcon, hint: "Awaiting payment over 3 days", ...(p.overdue > 0 ? { tone: "bad" as const } : {}) },
        ]}
      />
    );
  }
  if (view === "free") {
    const fr = await freeRange(await searchParams);
    const today = zonedDateIso(requestNow(), (await getAppSettings()).timezone);
    const [count, f] = await Promise.all([countFreeTiffinOrders(visible, await withListDates(await searchParams)), getFreeTiffinStats(visible, fr, today)]);
    return (
      <StatCards
        items={[
          { label: "Orders", value: count, icon: GiftIcon, hint: "Created in the range, given free tiffins", href: ordersListHref(dates, { view: "free" }) },
          { label: "Free tiffins delivered", value: f.delivered, icon: PackageCheckIcon, hint: "In the date range, up to today" },
          { label: "Still to deliver", value: f.toDeliver, icon: TruckIcon, hint: "Scheduled after today" },
        ]}
      />
    );
  }
  if (view === "missed") {
    const rows = await listMissedDeliveries(visible);
    const orderCount = new Set(rows.map((r) => r.orderPublicId)).size;
    return (
      <StatCards
        items={[
          { label: "Missed days", value: rows.length, icon: CalendarX2Icon, hint: "Every date", href: ordersListHref({}, { view: "missed" }) },
          { label: "Orders hit", value: orderCount, icon: UsersIcon, hint: "Distinct orders" },
          ...(Object.entries(MISSED_WHY) as [keyof typeof MISSED_WHY, string][]).map(([kind, label]) => ({
            label,
            value: rows.filter((r) => r.kind === kind).length,
            icon: CalendarOffIcon,
            hint: "Missed days",
            href: `/dashboard/orders?view=missed&why=${kind}`,
          })),
        ]}
      />
    );
  }
  const o = await getOrdersOverview(range, visible);

  const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "—");

  const stats: StatCardItem[] = [
    {
      label: "New orders",
      value: o.newOrders.count,
      icon: PackageIcon,
      hint: `${o.newOrders.count - o.newOrders.returning} first-time · ${o.newOrders.returning} returning`,
      delta: { now: o.newOrders.count, before: o.newOrders.prevCount, good: "up" },
      href: ordersListHref(dates, { status: "booked" }),
    },
    {
      label: "Starting soon",
      value: o.startingSoon.count,
      icon: CalendarClockIcon,
      hint: `Next 7 days · ${o.startingSoon.unpaid} unpaid · ${o.startingSoon.waitlisted} waitlisted`,
      href: ordersListHref({}, { status: "soon", starts: "7", clearDates: true }),
    },
    {
      label: "Running plans",
      value: o.running.count,
      icon: ActivityIcon,
      hint: `${o.running.trials} on trial · right now`,
      href: ordersListHref({}, { status: "running", clearDates: true }),
    },
    {
      label: "Renewal rate",
      value: pct(o.renewals.renewed, o.renewals.ended),
      icon: RefreshCwIcon,
      hint: `${o.renewals.renewed} of ${o.renewals.ended} plans that ended booked again`,
      // Rate over a cohort — drill to the Renewals desk rather than inventing a list facet.
      href: "/dashboard/renewals",
    },
    {
      label: "Cancelled",
      value: o.cancelled.count,
      icon: CircleXIcon,
      hint: `${o.cancelled.prevCount} in the previous period`,
      delta: { now: o.cancelled.count, before: o.cancelled.prevCount, good: "down" },
      href: ordersListHref(dates, { cancelledAt: true }),
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
    const today = zonedDateIso(requestNow(), timezone);
    const rows = filterMissedRows(all, raw, today);
    const spec: FacetDef[] = [
      { kind: "pills", field: "why", label: "Why", options: Object.entries(MISSED_WHY).map(([value, label]) => ({ value, label })) },
      { kind: "select", field: "day", label: "Day", options: [...MISSED_DAYS] },
      { kind: "search", fields: ["customerName", "orderCode", "planName"] },
    ];
    return <MissedList rows={rows} anyMissed={all.length > 0} spec={spec} isAdmin={isAdmin(session)} today={today} />;
  }
  const lookOutOnly = raw.view === "lookout";
  const paymentReview = raw.view === "payment";
  const freeTiffins = raw.view === "free";
  const cancelledAt = raw.cancelledAt === "1";
  // Running / starting-soon KPIs are "right now"; cancel-dated lists use activity time, not createdAt.
  const datesAll = raw.dates === "all" && !raw.from && !raw.to;
  const ignoreCreatedAt =
    datesAll ||
    lookOutOnly ||
    paymentReview ||
    raw.missed === "yes" ||
    cancelledAt ||
    raw.status === "running" ||
    raw.status === "soon";
  // A flagged, unpaid or missed-day order stays on its tab however old it is. The date picker
  // writes the current month onto every URL, so the bounds are dropped here, not just left unset.
  const sp = ignoreCreatedAt ? { ...raw, from: undefined, to: undefined } : await withListDates(raw);
  const cancelRange = cancelledAt ? await withDefaultMonth(raw) : null;
  const sort = parseSort(
    sp,
    ["name", "status", "start", "total", "created"],
    // The Look out for tab leads with the newest flag, however old the order is.
    lookOutOnly ? { column: "flagged", dir: "desc" } : { column: "created", dir: "desc" },
  );

  const session = await getSession();
  const visible = await resolveSessionVisibleOrgIds(session);
  const [{ planOptions, sizeOptions, zoneOptions, orgOptions, frequencyOptions }, ownerOptions, { timezone }] = await Promise.all([
    loadOrderFilterOptions(visible),
    loadOwnerOptions(),
    getAppSettings(),
  ]);
  const spec = buildOrdersSpec({ planOptions, sizeOptions, zoneOptions, orgOptions, ownerOptions, frequencyOptions });

  // "missed" / "starts" / "cancelledAt" aren't plain orders columns: strip before parseFilterState.
  const missedOnly = sp.missed === "yes";
  // "starts" is relative to today in the app timezone, so it is built here rather than by parseFilterState.
  const startsDays = STARTS_DAYS.find((d) => String(d) === sp[STARTS_FIELD]);
  const todayIso = zonedDateIso(requestNow(), timezone);
  // N calendar days inclusive of today: starts=7 → today..today+6 (Starting soon KPI).
  const startsEnd = startsDays == null ? null : startsDays === 0 ? todayIso : addDaysIso(todayIso, startsDays - 1);
  const startsCond = startsEnd != null ? between("startDate", todayIso, startsEnd) : null;
  const { sp: filterSp, extra } = orderStatusFilter({
    ...sp,
    missed: undefined,
    cancelledAt: undefined,
    [STARTS_FIELD]: undefined,
  });
  const { condition, page } = parseFilterState(spec, filterSp);
  const extras = [extra, startsCond].filter((c) => c != null);
  const finalCondition = extras.length ? and(...[condition, ...extras].filter((c) => c != null)) : condition;

  const missedAsOf = missedOnly ? zonedDateIso(requestNow(), (await getAppSettings()).timezone) : undefined;

  const result = await listOrdersPage(finalCondition, page, sort, visible, {
      lookOutOnly,
      paymentReview,
      freeTiffins,
      missedAsOf,
      cancelledInRange:
        cancelRange?.from != null && cancelRange.to != null
          ? { from: Number(cancelRange.from), to: Number(cancelRange.to) }
          : undefined,
    });

  return (
    <OrdersList
      spec={spec}
      rows={result.items}
      total={result.total}
      page={page.page}
      size={page.size}
      sort={sort}
      lookOutView={lookOutOnly}
      paymentReviewView={paymentReview}
      freeTiffinsView={freeTiffins}
    />
  );
}

async function NewOrderAction() {
  await requireStaff();

  const [{ defaultCountry, currency }, sources, catalog, slots, planKeys] = await Promise.all([
    getAppSettings(),
    listActiveLeadSources(),
    loadCatalogSnapshot(),
    dishCategoriesService.enabledCategories(),
    dishCategoriesService.planKeysByCategoryKey(),
  ]);

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
