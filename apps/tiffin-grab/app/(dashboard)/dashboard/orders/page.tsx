import { savePct } from "@/lib/pricing/discounts";
import { Suspense } from "react";
import { sql } from "drizzle-orm";
import { PackageIcon, ActivityIcon, ClockIcon, WalletIcon } from "lucide-react";
import { formatMoney } from "@foundry/commons";
import { db } from "@/db/client";
import { leadSources, leadSubsources, orders } from "@/db/schema";
import { requireStaff } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { countMigratedWaiting, listOrdersPage, resolveSessionVisibleOrgIds } from "@/lib/services/orders.service";
import { canReassign } from "@/lib/services/reassign";
import { listAssignableStaff } from "@/lib/services/assignable-staff";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { listableMealSizes } from "@/lib/catalog/types";
import { dishCategoriesService } from "@/lib/services/dish-categories.service";
import { parseSort } from "@/lib/list/sort";
import { Skeleton } from "@foundry/ui/skeleton";
import {
  PageShell,
  PageHeader,
  SectionCard,
  StatGrid,
  SkeletonStatCards,
  parseFilterState,
  type FacetDef,
} from "@/components/ds";
import { OrdersList, OrdersListSkeleton } from "./orders-list";
import { ORDER_STATUS_PILLS, ongoingFilter } from "./status-pills";
import { and } from "@foundry/commons/model/condition";
import { NewOrderSheet } from "./new-order-sheet";
import { StartMigratedDialog } from "./start-migrated-dialog";

type SearchParams = Promise<Record<string, string | undefined>>;

export default function OrdersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
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
      <Suspense fallback={<SkeletonStatCards count={4} />}>
        <OrdersStats />
      </Suspense>
      <SectionCard title="All orders">
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

async function OrdersStats() {
  await requireStaff();

  const [s] = await db
    .select({
      total: sql<number>`count(*)`.mapWith(Number),
      active: sql<number>`count(*) filter (where ${orders.status} = 'active')`.mapWith(Number),
      pending: sql<number>`count(*) filter (where ${orders.status} = 'pending')`.mapWith(Number),
      revenue: sql<number>`coalesce(sum(${orders.total}) filter (where ${orders.status} <> 'cancelled'), 0)`.mapWith(Number),
    })
    .from(orders);

  const stats = [
    { label: "Total orders", value: s.total, icon: PackageIcon },
    { label: "Active", value: s.active, icon: ActivityIcon },
    { label: "Pending", value: s.pending, icon: ClockIcon },
    { label: "Revenue", value: formatMoney(s.revenue), icon: WalletIcon, hint: "excl. cancelled" },
  ];

  return <StatGrid cols={4} items={stats} />;
}

async function OrdersData({ searchParams }: { searchParams: SearchParams }) {
  await requireStaff();

  const sp = await searchParams;
  const sort = parseSort(
    sp,
    ["name", "status", "start", "total", "created"],
    { column: "created", dir: "desc" },
  );

  const spec: FacetDef[] = [
    {
      kind: "pills",
      field: "status",
      label: "Status",
      options: ORDER_STATUS_PILLS.map((p) => ({ value: p.value, label: p.label })),
    },
    { kind: "dateRange", field: "createdAt", label: "Created" },
    { kind: "search", fields: ["fullName", "deploymentId"] },
  ];

  const { sp: filterSp, extra } = ongoingFilter(sp);
  const { condition, page } = parseFilterState(spec, filterSp);
  const finalCondition = extra ? and(...[condition, extra].filter((c) => c != null)) : condition;

  const session = await getSession();
  const visible = await resolveSessionVisibleOrgIds(session);

  const [result, reassignAllowed] = await Promise.all([
    listOrdersPage(finalCondition, page, sort, visible),
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

  const orderCatalog = {
    plans: catalog.plans.map((p) => ({ key: p.key, name: p.name })),
    mealSizes: listableMealSizes(catalog.mealSizes).map((m) => ({ id: m.publicId, name: m.name, diet: m.planKey, trial: m.trial })),
    frequencies: catalog.frequencies.map((f) => ({ key: f.key, name: f.name, weekdays: f.weekdays, savePct: savePct(catalog.discounts, "delivery", f.publicId, 0, catalog.maxDiscountPct) })),
    minTiffinsPerWeek: catalog.minTiffinsPerWeek,
    maxTiffinsPerWeek: catalog.maxTiffinsPerWeek,
    durations: catalog.durations.map((d) => ({ weeks: d.weeks })),
  };

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
