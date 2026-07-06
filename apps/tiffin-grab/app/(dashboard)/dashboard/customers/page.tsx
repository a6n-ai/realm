import { Suspense } from "react";
import { UsersIcon, PlusIcon, ShoppingBagIcon, RepeatIcon, UserPlusIcon } from "lucide-react";
import { asc, desc, eq, sql } from "drizzle-orm";
import { tzToDefaultCountry } from "@realm/commons";
import { requireStaff } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { deliveryZones, leadSources, leadSubsources, orders, users } from "@/db/schema";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { mealSlotsService } from "@/lib/services/meal-slots.service";
import { parseSort, type SortState } from "@/lib/list/sort";
import { Button } from "@realm/ui/button";
import { Skeleton } from "@realm/ui/skeleton";
import { PageShell, PageHeader, SectionCard, StatCard, StatGrid, SkeletonStatCards } from "@/components/ds";
import { CustomersList, CustomersListSkeleton } from "./customers-list";
import { NewCustomerSheet } from "./new-customer-sheet";

const SORT_COL = {
  name: users.name,
  email: users.email,
  phone: users.phone,
  orders: sql`count(${orders.id})`,
} as const;

type CustomerSortColumn = keyof typeof SORT_COL;

type SearchParams = Promise<{ sort?: string; dir?: string }>;

// The page shell returns synchronously (no top-level await), so `loading.tsx`
// never fires — instead each async child below streams into its own <Suspense>
// with a skeleton that mirrors that component. Header title paints instantly;
// the action button and the table fill in as their data resolves.
export default function CustomersPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <PageShell>
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

  return (
    <StatGrid cols={4}>
      {stats.map((st) => (
        <StatCard key={st.label} {...st} />
      ))}
    </StatGrid>
  );
}

async function CustomersData({ searchParams }: { searchParams: SearchParams }) {
  await requireStaff();

  const sort: SortState<CustomerSortColumn> = parseSort(
    await searchParams,
    ["name", "email", "phone", "orders"],
    { column: "orders", dir: "desc" },
  );

  const col = SORT_COL[sort.column];
  const orderBy = sort.dir === "asc" ? asc(col) : desc(col);

  const rows = await db
    .select({
      publicId: users.publicId,
      name: users.name,
      email: users.email,
      phone: users.phone,
      orderCount: sql<number>`count(${orders.id})`.mapWith(Number),
      latestStatus: sql<string | null>`(array_agg(${orders.status} order by ${orders.createdAt} desc))[1]`,
    })
    .from(users)
    .leftJoin(orders, eq(orders.userId, users.id))
    .where(eq(users.role, "user"))
    .groupBy(users.id, users.publicId, users.name, users.email, users.phone)
    .orderBy(orderBy)
    .limit(500);

  return <CustomersList rows={rows} sort={sort} />;
}

async function NewCustomerAction() {
  await requireStaff();

  const [{ timezone }, sourceRows, subRows, catalog, slots, zones] = await Promise.all([
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
    mealSlotsService.enabledSlots(),
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

  const defaultCountry = tzToDefaultCountry(timezone);

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
    mealSizes: catalog.mealSizes.map((m) => ({ id: m.publicId, name: m.name, diet: m.diet })),
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
