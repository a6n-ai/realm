import { Suspense } from "react";
import { notFound } from "next/navigation";
import { UtensilsCrossedIcon } from "lucide-react";
import { asc, desc, eq, getTableColumns, inArray, type Column as DrizzleColumn } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import { addons, deliveryFrequencies, deliveryZones, dishCategories, dishes, durationPackages, mealSizeItems, mealSizes, plans, pricingTiers } from "@/db/schema";
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

export type SearchParams = Promise<{ sort?: string; dir?: string }>;

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

// Exported for reuse by the combined dishes+dish-categories tabbed page, which
// mounts this loader twice (once per resource) instead of duplicating it.
export async function CatalogData({ resource, searchParams }: { resource: string; searchParams: SearchParams }) {
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
    } else if (f.optionsSource === "plans") {
      // Dropdown value is the plan publicId — the same identifier the meal-size
      // service resolves back to plans.id on write.
      const planRows = await db.select({ publicId: plans.publicId, name: plans.name }).from(plans).where(eq(plans.active, true));
      dynamicOptions[f.key] = planRows.map((p) => ({ value: p.publicId, label: p.name }));
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

  // Meal sizes carry two things the generic flatten can't: the plan reference is
  // stored as a bigint FK but the editor works in plan publicId space, and the
  // composition lives in a second table. Resolve planId → publicId (so the plan
  // dropdown preselects) and attach each row's items ordered by sortOrder.
  if (resource === "meal-sizes") {
    const planPublicById = new Map(
      (await db.select({ id: plans.id, publicId: plans.publicId }).from(plans)).map((p) => [p.id, p.publicId]),
    );
    const mealSizeIds = raw.map((r) => r.id as bigint);
    const itemRows = mealSizeIds.length
      ? await db.select().from(mealSizeItems).where(inArray(mealSizeItems.mealSizeId, mealSizeIds)).orderBy(asc(mealSizeItems.sortOrder))
      : [];
    const itemsByMealSize = new Map<bigint, Record<string, unknown>[]>();
    for (const it of itemRows) {
      const bucket = itemsByMealSize.get(it.mealSizeId) ?? [];
      bucket.push({
        name: it.name,
        category: it.category,
        // numeric column ⇒ string in Drizzle; blank the null so the Input renders empty.
        weightValue: it.weightValue == null ? "" : String(it.weightValue),
        weightUnit: it.weightUnit ?? "",
        qty: it.qty,
      });
      itemsByMealSize.set(it.mealSizeId, bucket);
    }
    rows.forEach((dto, i) => {
      const id = raw[i].id as bigint;
      dto.planId = planPublicById.get(raw[i].planId as bigint) ?? "";
      dto.items = itemsByMealSize.get(id) ?? [];
    });
  }

  return <ResourceEditor resource={resource} rows={rows} dynamicOptions={dynamicOptions} sort={sort} />;
}
