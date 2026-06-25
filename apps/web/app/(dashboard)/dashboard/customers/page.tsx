import { UsersIcon, PlusIcon } from "lucide-react";
import { asc, desc, eq, sql } from "drizzle-orm";
import { tzToDefaultCountry } from "@tiffin/commons";
import { requireStaff } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { leadSources, leadSubsources, orders, users } from "@/db/schema";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { mealSlotsService } from "@/lib/services/meal-slots.service";
import { parseSort, type SortState } from "@/lib/list/sort";
import { Button } from "@/components/ui/button";
import { PageShell, PageHeader, SectionCard } from "@/components/ds";
import { CustomersList } from "./customers-list";
import { NewCustomerSheet } from "./new-customer-sheet";

const SORT_COL = {
  email: users.email,
  phone: users.phone,
  orders: sql`count(${orders.id})`,
} as const;

type CustomerSortColumn = keyof typeof SORT_COL;

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; dir?: string }>;
}) {
  await requireStaff();

  const sort: SortState<CustomerSortColumn> = parseSort(
    await searchParams,
    ["email", "phone", "orders"],
    { column: "orders", dir: "desc" },
  );

  const col = SORT_COL[sort.column];
  const orderBy = sort.dir === "asc" ? asc(col) : desc(col);

  const [rows, { timezone }, sourceRows, subRows, catalog, slots] = await Promise.all([
    db
      .select({
        publicId: users.publicId,
        email: users.email,
        phone: users.phone,
        orderCount: sql<number>`count(${orders.id})`.mapWith(Number),
        latestStatus: sql<string | null>`(array_agg(${orders.status} order by ${orders.createdAt} desc))[1]`,
      })
      .from(users)
      .leftJoin(orders, eq(orders.userId, users.id))
      .where(eq(users.role, "user"))
      .groupBy(users.id, users.publicId, users.email, users.phone)
      .orderBy(orderBy)
      .limit(500),
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

  const newCustomerTrigger = (
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

  return (
    <PageShell>
      <PageHeader
        icon={UsersIcon}
        title="Customers"
        subtitle={`${rows.length} total`}
        actions={newCustomerTrigger}
      />
      <SectionCard title="All customers" subtitle={rows.length === 0 ? "Nothing yet" : undefined}>
        <CustomersList rows={rows} sort={sort} />
      </SectionCard>
    </PageShell>
  );
}

export type { CustomerSortColumn };
