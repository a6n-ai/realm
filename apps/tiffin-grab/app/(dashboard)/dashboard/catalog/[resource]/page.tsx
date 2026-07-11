import { Suspense } from "react";
import { notFound } from "next/navigation";
import { UtensilsCrossedIcon } from "lucide-react";
import { asc, desc, getTableColumns, type Column as DrizzleColumn } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import { addons, deliveryFrequencies, deliveryZones, dishCategories, dishes, durationPackages, mealSizes, plans, pricingTiers } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/guards";
import { dishCategoriesService } from "@/lib/services/dish-categories.service";
import { parseSort } from "@/lib/list/sort";
import { PageHeader, PageShell, SectionCard } from "@/components/ds";
import { RESOURCES, WEEKDAY_OPTIONS, WEEKDAY_LABELS, type FieldType, type ResourceDef } from "../resource-config";
import { ResourceEditor, ResourceEditorSkeleton } from "./resource-editor";

const TABLES: Record<string, PgTable> = {
  dishes,
  "dish-categories": dishCategories,
  plans,
  "meal-sizes": mealSizes,
  "delivery-frequencies": deliveryFrequencies,
  "duration-packages": durationPackages,
  "delivery-zones": deliveryZones,
  "pricing-tiers": pricingTiers,
  addons,
};

// Synthetic column exposed to sorting that isn't a plain field: maps to `active`.
const STATUS_SORT_KEY = "status";

// Which field types carry a meaningful server sort. Mirrors SORTABLE_FIELD_TYPES
// in resource-editor.tsx so the header's sortable flags and the server's
// whitelist/orderBy stay in lockstep (the client module can't be imported here).
const SORTABLE_FIELD_TYPES = new Set<FieldType>(["text", "number", "select", "date", "boolean"]);

function sortableColumns(def: ResourceDef): string[] {
  const cols = def.fields.filter((f) => !f.tableHidden && f.key !== "key");
  return [
    ...cols.filter((f, i) => i === 0 || SORTABLE_FIELD_TYPES.has(f.type)).map((f) => f.key),
    STATUS_SORT_KEY,
  ];
}

type SearchParams = Promise<{ sort?: string; dir?: string }>;

export default async function CatalogResourcePage({
  params, searchParams,
}: {
  params: Promise<{ resource: string }>;
  searchParams: SearchParams;
}) {
  const { resource } = await params;
  const def: ResourceDef | undefined = RESOURCES[resource];
  return (
    <PageShell>
      <PageHeader icon={UtensilsCrossedIcon} title={def?.label ?? "Catalog"} />
      <SectionCard title="Entries">
        <Suspense fallback={<ResourceEditorSkeleton resource={resource} />}>
          <CatalogData resource={resource} searchParams={searchParams} />
        </Suspense>
      </SectionCard>
    </PageShell>
  );
}

async function CatalogData({ resource, searchParams }: { resource: string; searchParams: SearchParams }) {
  await requireAdmin();
  const def: ResourceDef | undefined = RESOURCES[resource];
  const table = TABLES[resource];
  if (!def || !table) notFound();

  const needsCategories = def.fields.some((f) => f.optionsSource === "categories");
  const categoryRows = needsCategories ? await dishCategoriesService.enabledCategories() : [];
  const dynamicOptions: Record<string, { value: string; label: string }[]> = {};
  for (const f of def.fields) {
    if (f.optionsSource === "categories") {
      dynamicOptions[f.key] = categoryRows.map((c) => ({ value: c.key, label: c.label }));
    } else if (f.optionsSource === "weekdays") {
      dynamicOptions[f.key] = WEEKDAY_OPTIONS.map((d) => ({ value: d, label: WEEKDAY_LABELS[d] }));
    }
  }

  const allowed = sortableColumns(def);
  const sort = parseSort(await searchParams, allowed, { column: allowed[0], dir: "asc" });

  const statusField = def.statusField ?? "active";
  const columns = getTableColumns(table) as Record<string, DrizzleColumn>;
  const sortCol = columns[sort.column === STATUS_SORT_KEY ? statusField : sort.column];
  const orderBy = sort.dir === "asc" ? asc(sortCol) : desc(sortCol);

  const raw = (await db.select().from(table).orderBy(orderBy)) as Record<string, unknown>[];
  const rows = raw.map((r) => {
    const dto: Record<string, unknown> & { publicId: string } = {
      publicId: r.publicId as string,
      // Normalize the resource's status column onto `active` so the editor's
      // retire/restore UI works uniformly (dish_categories uses `enabled`).
      active: r[statusField],
    };
    for (const f of def.fields) dto[f.key] = r[f.key];
    return dto;
  });

  return <ResourceEditor resource={resource} rows={rows} dynamicOptions={dynamicOptions} sort={sort} />;
}
