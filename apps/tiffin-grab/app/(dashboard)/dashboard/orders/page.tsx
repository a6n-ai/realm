import { Suspense } from "react";
import { eq, sql } from "drizzle-orm";
import { PackageIcon, PlusIcon, ActivityIcon, ClockIcon, WalletIcon } from "lucide-react";
import { formatMoney } from "@realm/commons";
import { db } from "@/db/client";
import { deliveryZones, leadSources, leadSubsources, orders } from "@/db/schema";
import { requireStaff } from "@/lib/auth/guards";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { listOrdersPage } from "@/lib/services/orders.service";
import { canReassign } from "@/lib/services/reassign";
import { listAssignableStaff } from "@/lib/services/assignable-staff";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { dishCategoriesService } from "@/lib/services/dish-categories.service";
import { parseSort } from "@/lib/list/sort";
import { Button } from "@realm/ui/button";
import { Skeleton } from "@realm/ui/skeleton";
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
import { ORDER_STATUS_PILLS } from "./status-pills";
import { NewOrderSheet } from "./new-order-sheet";

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
          <Suspense fallback={<Skeleton className="h-9 w-32" />}>
            <NewOrderAction />
          </Suspense>
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

  const { condition, page } = parseFilterState(spec, sp);

  const [result, reassignAllowed] = await Promise.all([
    listOrdersPage(condition, page, sort),
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

  const [{ defaultCountry }, sourceRows, subRows, catalog, slots, zones] = await Promise.all([
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
    db
      .select({
        name: deliveryZones.name,
        postalPrefixes: deliveryZones.postalPrefixes,
        slotWindow: deliveryZones.slotWindow,
        active: deliveryZones.active,
      })
      .from(deliveryZones)
      .where(eq(deliveryZones.active, true)),
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
    mealSizes: catalog.mealSizes.map((m) => ({ id: m.publicId, name: m.name, diet: m.planKey })),
    frequencies: catalog.frequencies.map((f) => ({ key: f.key, name: f.name })),
    durations: catalog.durations.map((d) => ({ weeks: d.weeks })),
  };
  const enabledSlots = slots.map((s) => ({ key: s.key, label: s.label }));

  return (
    <NewOrderSheet
      defaultCountry={defaultCountry}
      sources={sources}
      catalog={orderCatalog}
      enabledSlots={enabledSlots}
      zones={zones}
      trigger={
        <Button>
          <PlusIcon className="size-4" />
          New order
        </Button>
      }
    />
  );
}
