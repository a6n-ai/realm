import { Suspense } from "react";
import { UsersIcon, PlusIcon, ShoppingBagIcon, RepeatIcon, UserPlusIcon } from "lucide-react";
import { eq, sql } from "drizzle-orm";
import { requireStaff } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { deliveryZones, leadSources, leadSubsources, orders, users } from "@/db/schema";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { listCustomersPage, type CustomerSortColumn } from "@/lib/services/customers.service";
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
import { CustomersList, CustomersListSkeleton } from "./customers-list";
import { NewCustomerSheet } from "./new-customer-sheet";
import { MarkSectionRead } from "@/components/dashboard/mark-section-read";

type SearchParams = Promise<Record<string, string | undefined>>;

// The page shell returns synchronously (no top-level await), so `loading.tsx`
// never fires — instead each async child below streams into its own <Suspense>
// with a skeleton that mirrors that component. Header title paints instantly;
// the action button and the table fill in as their data resolves.
export default function CustomersPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <PageShell>
      <MarkSectionRead section="customers" />
      <PageHeader
        icon={UsersIcon}
        title="Customers"
        actions={
          <Suspense fallback={<Skeleton className="h-9 w-32" />}>
            <NewCustomerAction />
          </Suspense>
        }
      />
      <Suspense fallback={<SkeletonStatCards count={4} />}>
        <CustomersStats />
      </Suspense>
      <SectionCard title="All customers">
        <Suspense fallback={<CustomersListSkeleton />}>
          <CustomersData searchParams={searchParams} />
        </Suspense>
      </SectionCard>
    </PageShell>
  );
}

async function CustomersStats() {
  await requireStaff();

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const oc = db
    .select({ userId: orders.userId, c: sql<number>`count(*)`.as("c") })
    .from(orders)
    .groupBy(orders.userId)
    .as("oc");

  const [s] = await db
    .select({
      total: sql<number>`count(*)`.mapWith(Number),
      withOrders: sql<number>`count(*) filter (where ${oc.c} > 0)`.mapWith(Number),
      repeat: sql<number>`count(*) filter (where ${oc.c} >= 2)`.mapWith(Number),
      newThisWeek: sql<number>`count(*) filter (where ${users.createdAt} >= ${weekAgo})`.mapWith(Number),
    })
    .from(users)
    .leftJoin(oc, eq(oc.userId, users.id))
    .where(eq(users.role, "user"));

  const stats = [
    { label: "Total customers", value: s.total, icon: UsersIcon },
    { label: "With orders", value: s.withOrders, icon: ShoppingBagIcon },
    { label: "Repeat buyers", value: s.repeat, icon: RepeatIcon, hint: "2+ orders" },
    { label: "New this week", value: s.newThisWeek, icon: UserPlusIcon },
  ];

  return <StatGrid cols={4} items={stats} />;
}

async function CustomersData({ searchParams }: { searchParams: SearchParams }) {
  await requireStaff();

  const sp = await searchParams;
  const sort = parseSort(sp, ["name", "email", "phone", "orders"], { column: "orders", dir: "desc" });

  const spec: FacetDef[] = [
    { kind: "dateRange", field: "createdAt", label: "Joined" },
    { kind: "search", fields: ["name", "phone"] },
  ];

  const { condition, page } = parseFilterState(spec, sp);

  const result = await listCustomersPage(condition, page, sort);

  return <CustomersList spec={spec} rows={result.items} total={result.total} page={page.page} size={page.size} sort={sort} />;
}

async function NewCustomerAction() {
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
    <NewCustomerSheet
      defaultCountry={defaultCountry}
      sources={sources}
      catalog={orderCatalog}
      enabledSlots={enabledSlots}
      zones={zones}
      trigger={
        <Button>
          <PlusIcon className="size-4" />
          New customer
        </Button>
      }
    />
  );
}

export type { CustomerSortColumn };
