import { savePct } from "@/lib/pricing/discounts";
import { Suspense } from "react";
import { UsersIcon, PlusIcon, ShoppingBagIcon, RepeatIcon, UserPlusIcon, UserXIcon } from "lucide-react";
import { StatCards, StatCardsSkeleton, type StatCardItem } from "@/components/dashboard/stat-cards";
import { and, eq, gte, sql } from "drizzle-orm";
import { requireStaff } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import { db } from "@/db/client";
import { leadSources, leadSubsources, orders, users } from "@/db/schema";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { countPendingInvites, listCustomersPage, type CustomerSortColumn } from "@/lib/services/customers.service";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { listableMealSizes, mealSizeAddons } from "@/lib/catalog/types";
import { dishCategoriesService } from "@/lib/services/dish-categories.service";
import { parseSort } from "@/lib/list/sort";
import { Button } from "@foundry/ui/button";
import { Skeleton } from "@foundry/ui/skeleton";
import {
  PageShell,
  PageHeader,
  SectionCard,
  parseFilterState,
  type FacetDef,
} from "@/components/ds";
import { CustomersList, CustomersListSkeleton } from "./customers-list";
import { NewCustomerSheet } from "./new-customer-sheet";
import { InvitePendingButton } from "./invite-pending-button";
import { MarkSectionRead } from "@/components/dashboard/mark-section-read";
import { SectionDateRange } from "@/components/filters/section-date-range";
import { epochBoundsWhere, withDefaultMonth, withListDates } from "@/lib/list/default-month";

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
      {/* The date range filters the cards: one group, tighter than the page rhythm. */}
      <div className="flex flex-col gap-3">
        <div className="flex">
          <SectionDateRange />
        </div>
        <Suspense fallback={<StatCardsSkeleton count={5} />}>
          <CustomersStats searchParams={searchParams} />
        </Suspense>
      </div>
      <SectionCard
        title="All customers"
        action={
          <Suspense fallback={null}>
            <InvitePendingAction />
          </Suspense>
        }
      >
        <Suspense fallback={<CustomersListSkeleton />}>
          <CustomersData searchParams={searchParams} />
        </Suspense>
      </SectionCard>
    </PageShell>
  );
}

async function InvitePendingAction() {
  await requireStaff();
  if ((await getSession())?.user?.role !== "admin") return null;
  return <InvitePendingButton count={await countPendingInvites()} />;
}

async function CustomersStats({ searchParams }: { searchParams: SearchParams }) {
  await requireStaff();
  const sp = await withDefaultMonth(await searchParams);

  // eslint-disable-next-line react-hooks/purity -- server component: reading the request clock is the point
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const oc = db
    .select({ userId: orders.userId, c: sql<number>`count(*)`.as("c") })
    .from(orders)
    .groupBy(orders.userId)
    .as("oc");

  const [[s], [week]] = await Promise.all([
    db
      .select({
        total: sql<number>`count(*)`.mapWith(Number),
        withOrders: sql<number>`count(*) filter (where ${oc.c} > 0)`.mapWith(Number),
        repeat: sql<number>`count(*) filter (where ${oc.c} >= 2)`.mapWith(Number),
      })
      .from(users)
      .leftJoin(oc, eq(oc.userId, users.id))
      .where(and(eq(users.role, "user"), epochBoundsWhere(users.createdAt, sp))),
    db
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(users)
      .where(and(eq(users.role, "user"), gte(users.createdAt, weekAgo))),
  ]);

  const pct = (n: number) => (s.total > 0 ? `${Math.round((n / s.total) * 100)}% of customers` : "—");
  const stats: StatCardItem[] = [
    { label: "Total customers", value: s.total, icon: UsersIcon, hint: "joined in selected dates" },
    { label: "With orders", value: s.withOrders, icon: ShoppingBagIcon, hint: pct(s.withOrders) },
    { label: "No order yet", value: s.total - s.withOrders, icon: UserXIcon, hint: "signed up, never ordered" },
    { label: "Repeat buyers", value: s.repeat, icon: RepeatIcon, hint: `2+ orders · ${pct(s.repeat)}` },
    { label: "New this week", value: week.n, icon: UserPlusIcon, hint: "joined in the last 7 days" },
  ];

  return <StatCards items={stats} />;
}

export async function CustomersData({ searchParams }: { searchParams: SearchParams }) {
  await requireStaff();

  const sp = await withListDates(await searchParams);
  const sort = parseSort(sp, ["name", "email", "phone", "orders"], { column: "orders", dir: "desc" });

  const spec: FacetDef[] = [
    { kind: "dateRange", field: "createdAt", label: "Joined" },
    {
      kind: "select",
      field: "planCompletesInDays",
      label: "Plan Completes In",
      options: [
        { value: "3", label: "Next 3 days" },
        { value: "4", label: "Next 4 days" },
        { value: "5", label: "Next 5 days" },
        { value: "7", label: "Next 7 days" },
        { value: "14", label: "Next 14 days" },
      ],
    },
    { kind: "search", fields: ["name", "phone", "email"] },
  ];

  // planCompletesInDays is a derived value, not a column: the full spec drives the
  // filter UI, the DB condition is parsed without it and it goes in as a custom filter.
  const parsed = Number(sp.planCompletesInDays);
  const planCompletesInDays = sp.planCompletesInDays && Number.isFinite(parsed) ? parsed : undefined;
  const dsSpec = spec.filter((s) => s.kind !== "select" || s.field !== "planCompletesInDays");
  const { condition: dbCondition, page: dbPage } = parseFilterState(dsSpec, sp);

  const result = await listCustomersPage(dbCondition, dbPage, sort, { planCompletesInDays });

  return <CustomersList spec={spec} rows={result.items} total={result.total} page={dbPage.page} size={dbPage.size} sort={sort} />;
}

async function NewCustomerAction() {
  await requireStaff();

  const [{ defaultCountry }, sourceRows, subRows, catalog, slots] = await Promise.all([
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
    mealSizes: listableMealSizes(catalog.mealSizes).map((m) => ({ id: m.publicId, name: m.name, diet: m.planKey, trial: m.trial, servesWeekends: m.servesWeekends, addons: m.trial ? [] : mealSizeAddons(catalog) })),
    frequencies: catalog.frequencies.map((f) => ({ key: f.key, name: f.name, weekdays: f.weekdays, savePct: savePct(catalog.discounts, "delivery", f.publicId, 0, catalog.maxDiscountPct) })),
    minTiffinsPerWeek: catalog.minTiffinsPerWeek,
    timezone: catalog.timezone,
    cutoffHour: catalog.cutoffHour,
    maxTiffinsPerWeek: catalog.maxTiffinsPerWeek,
    durations: catalog.durations.map((d) => ({ weeks: d.weeks })),
  };
  const enabledSlots = slots.map((s) => ({ key: s.key, label: s.label }));

  return (
    <NewCustomerSheet
      defaultCountry={defaultCountry}
      sources={sources}
      catalog={orderCatalog}
      enabledSlots={enabledSlots}
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
