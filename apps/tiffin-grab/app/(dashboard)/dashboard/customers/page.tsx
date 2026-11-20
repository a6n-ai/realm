import { DAY_MS } from "@foundry/commons/util/dates";
import { savePct } from "@/lib/pricing/discounts";
import { Suspense } from "react";
import { UsersIcon, PlusIcon, ShoppingBagIcon, RepeatIcon, UserPlusIcon, UserXIcon } from "lucide-react";
import { StatCards, StatCardsSkeleton, type StatCardItem } from "@/components/dashboard/stat-cards";
import { and, eq, gte, sql } from "drizzle-orm";
import { can, requirePagePermission } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { orders, users } from "@/db/schema";
import { getAppSettings } from "@/lib/settings";
import { listActiveLeadSources } from "@/lib/inquiries/lead-sources.service";
import { countPendingInvites, listCustomersPage, type CustomerSortColumn } from "@/lib/services/customers.service";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { listableMealSizes, mealSizeAddons } from "@/lib/catalog/types";
import { dishCategoriesService } from "@/lib/menu/dish-categories.service";
import { Button } from "@foundry/ui/button";
import { Skeleton } from "@foundry/ui/skeleton";
import { CustomersChrome } from "./customers-chrome";
import { CustomersList, CustomersListSkeleton } from "./customers-list";
import { CUSTOMER_SPEC, customerListQuery } from "./list-query";
import { CustomersExportButton } from "./customers-export-button";
import { CustomerPaymentsList, CustomerPaymentsListSkeleton } from "./customer-payments-list";
import { NewCustomerSheet } from "./new-customer-sheet";
import { InvitePendingButton } from "./invite-pending-button";
import { MarkSectionRead } from "@/components/dashboard/mark-section-read";
import { epochBoundsWhere, withDefaultMonth } from "@/lib/list/default-month";
import { customersListHref } from "@/lib/list/customers-drill";
import { requestNow } from "@/lib/dates/request-now";

const CUSTOMER_READ = { customer: ["read"] };
const CUSTOMER_WRITE = { customer: ["write"] };

type SearchParams = Promise<Record<string, string | undefined>>;

// The shell awaits only searchParams (to pick the tab); each data child below streams
// into its own <Suspense> with a skeleton that mirrors it, so the header paints at once
// and the action button and table fill in as their data resolves.
export default async function CustomersPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const canFinance = await can({ finance: ["read"] });
  const tab = sp.tab === "payments" && canFinance ? "payments" : "all";
  return (
    <CustomersChrome
      lead={<MarkSectionRead section="customers" />}
      actions={
        <Suspense fallback={<Skeleton className="h-9 w-32" />}>
          <NewCustomerAction />
        </Suspense>
      }
      dateBy={sp.dateBy === "ordered" ? "ordered" : "joined"}
      stats={
        <Suspense fallback={<StatCardsSkeleton count={5} />}>
          <CustomersStats searchParams={searchParams} />
        </Suspense>
      }
      tab={tab}
      showPayments={canFinance}
      searchParams={sp}
      listAction={
        <Suspense fallback={null}>{tab === "payments" ? <CustomersExportButton /> : <InvitePendingAction />}</Suspense>
      }
      list={
        <Suspense fallback={tab === "payments" ? <CustomerPaymentsListSkeleton /> : <CustomersListSkeleton />}>
          <CustomersData searchParams={searchParams} tab={tab} />
        </Suspense>
      }
    />
  );
}

async function InvitePendingButtonLoader() {
  return <InvitePendingButton count={await countPendingInvites()} />;
}

async function InvitePendingAction() {
  if (!(await can({ customer: ["manage"] }))) return null;
  return <InvitePendingButtonLoader />;
}

async function CustomersStats({ searchParams }: { searchParams: SearchParams }) {
  await requirePagePermission(CUSTOMER_READ);
  const sp = await withDefaultMonth(await searchParams);

  const now = requestNow();
  const weekAgo = now - 7 * DAY_MS;
  // Non-cancelled only — same definition as listCustomersPage customerType filters.
  const oc = db
    .select({ userId: orders.userId, c: sql<number>`count(*)`.as("c") })
    .from(orders)
    .where(sql`${orders.status} <> 'cancelled'`)
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
    {
      label: "Total customers",
      value: s.total,
      icon: UsersIcon,
      hint: "joined in selected dates",
      href: customersListHref(sp),
    },
    {
      label: "With orders",
      value: s.withOrders,
      icon: ShoppingBagIcon,
      hint: pct(s.withOrders),
      href: customersListHref(sp, { customerType: "ordered" }),
    },
    {
      label: "No order yet",
      value: s.total - s.withOrders,
      icon: UserXIcon,
      hint: "signed up, never ordered",
      href: customersListHref(sp, { customerType: "none" }),
    },
    {
      label: "Repeat buyers",
      value: s.repeat,
      icon: RepeatIcon,
      hint: `2+ orders · ${pct(s.repeat)}`,
      href: customersListHref(sp, { customerType: "repeat" }),
    },
    {
      label: "New this week",
      value: week.n,
      icon: UserPlusIcon,
      hint: "joined in the last 7 days",
      href: customersListHref(sp, { from: String(weekAgo), to: String(now) }),
    },
  ];

  return <StatCards items={stats} />;
}

async function CustomersData({ searchParams, tab }: { searchParams: SearchParams; tab: "all" | "payments" }) {
  await requirePagePermission(CUSTOMER_READ);
  if (tab === "payments") await requirePagePermission({ finance: ["read"] });
  const query = await customerListQuery(await searchParams);
  const canFinance = await can({ finance: ["read"] });
  const { condition, page, custom } = query;
  const sort = !canFinance && query.sort.column === "paid" ? { column: "latestOrder" as const, dir: "desc" as const } : query.sort;
  const result = await listCustomersPage(condition, page, sort, custom, { withPayments: canFinance });
  const props = { spec: CUSTOMER_SPEC, rows: result.items, total: result.total, page: page.page, size: page.size, sort };
  return tab === "payments" ? <CustomerPaymentsList {...props} /> : <CustomersList {...props} canFinance={canFinance} />;
}

async function NewCustomerAction() {
  if (!(await can(CUSTOMER_WRITE))) return null;

  const [{ defaultCountry }, sources, catalog, slots] = await Promise.all([
    getAppSettings(),
    listActiveLeadSources(),
    loadCatalogSnapshot(),
    dishCategoriesService.enabledCategories(),
  ]);

  const orderCatalog = {
    plans: catalog.plans.map((p) => ({ key: p.key, name: p.name })),
    mealSizes: listableMealSizes(catalog.mealSizes).map((m) => ({ id: m.publicId, name: m.name, diet: m.planKey, trial: m.trial, servesWeekends: m.servesWeekends, allowedDays: m.allowedDays ?? null, addons: m.trial ? [] : mealSizeAddons(catalog) })),
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
