import { Suspense } from "react";
import { PackageIcon, PlusIcon } from "lucide-react";
import { tzToDefaultCountry } from "@tiffin/commons";
import { db } from "@/db/client";
import { leadSources, leadSubsources } from "@/db/schema";
import { requireStaff } from "@/lib/auth/guards";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { listOrders } from "@/lib/services/orders.service";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { mealSlotsService } from "@/lib/services/meal-slots.service";
import { parseSort } from "@/lib/list/sort";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageShell, PageHeader, SectionCard } from "@/components/ds";
import { OrdersList } from "./orders-list";
import { NewOrderSheet } from "./new-order-sheet";

export default function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; dir?: string }>;
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
      <SectionCard title="All orders">
        <Suspense fallback={<OrdersList.Skeleton />}>
          <OrdersData searchParams={searchParams} />
        </Suspense>
      </SectionCard>
    </PageShell>
  );
}

async function OrdersData({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; dir?: string }>;
}) {
  await requireStaff();

  const sort = parseSort(
    await searchParams,
    ["name", "deployment", "status", "start", "total", "created"],
    { column: "created", dir: "desc" },
  );

  const rows = await listOrders({ sort });

  return <OrdersList rows={rows} sort={sort} />;
}

async function NewOrderAction() {
  await requireStaff();

  const [{ timezone }, sourceRows, subRows, catalog, slots] = await Promise.all([
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

  return (
    <NewOrderSheet
      defaultCountry={defaultCountry}
      sources={sources}
      catalog={orderCatalog}
      enabledSlots={enabledSlots}
      trigger={
        <Button>
          <PlusIcon className="size-4" />
          New order
        </Button>
      }
    />
  );
}
