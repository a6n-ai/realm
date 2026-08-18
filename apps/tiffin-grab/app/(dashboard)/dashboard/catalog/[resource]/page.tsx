import { Suspense } from "react";
import { notFound } from "next/navigation";
import { UtensilsCrossedIcon } from "lucide-react";
import { asc, desc, eq, getTableColumns, inArray, sql, type Column as DrizzleColumn } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import { addons, deliveryFrequencies, deliveryZones, dishCategories, dishes, durationPackages, mealSizeItems, mealSizes, plans, pricingTiers } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/guards";
import { dishCategoriesService } from "@/lib/services/dish-categories.service";
import { dishesService } from "@/lib/services/dishes.service";
import { columnResolver, conditionToSql, type FilterResolver } from "@realm/database";
import { parseFilterState, type FacetDef } from "@realm/design-system";
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

export type SearchParams = Promise<Record<string, string | undefined>>;

/**
 * Filter spec per resource, derived from its own field definitions so every
 * catalog page gets the same facet bar the orders and inquiries lists use
 * instead of a bespoke one each.
 *
 * - search over the text fields (plus `key` for keyed resources)
 * - a status pill pair, since every resource has a retire/restore state
 * - a `multi` facet for any select/multiselect field with resolvable options
 */
function facetsFor(def: ResourceDef, dynamicOptions: Record<string, { value: string; label: string }[]>): FacetDef[] {
  const spec: FacetDef[] = [];

  const searchFields = def.fields.filter((f) => f.type === "text").map((f) => f.key);
  if (def.keyed) searchFields.unshift("key");
  if (searchFields.length) spec.push({ kind: "search", fields: searchFields });

  spec.push({
    kind: "pills",
    field: "status",
    label: "Status",
    options: [
      { value: "active", label: "Active" },
      { value: "retired", label: "Retired" },
    ],
  });

  for (const f of def.fields) {
    if (f.type !== "select" && f.type !== "multiselect") continue;
    const options = dynamicOptions[f.key] ?? f.options?.map((o) => ({ value: o, label: f.optionLabels?.[o] ?? o }));
    if (options?.length) spec.push({ kind: "multi", field: f.key, label: f.label, options });
  }
  return spec;
}

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

  const sp = await searchParams;
  // Composition rows offer the slots of the plan the meal size is scoped to, so
  // a veg meal size can't be built out of healthy-plan slots. Sent as a map
  // rather than fetched per change, so switching the plan dropdown is instant.
  let categoriesByPlan: Record<string, { value: string; label: string }[]> | undefined;
  if (resource === "meal-sizes") {
    const planRows = await db.select({ id: plans.id, publicId: plans.publicId }).from(plans).where(eq(plans.active, true));
    const entries = await Promise.all(
      planRows.map(async (p) => [
        p.publicId,
        (await dishCategoriesService.forPlan(p.id)).map((c) => ({ value: c.key, label: c.label })),
      ] as const),
    );
    categoriesByPlan = Object.fromEntries(entries);
  }

  const allowed = sortableColumns(def);
  const sort = parseSort(sp, allowed, { column: allowed[0], dir: "asc" });

  const statusField = def.statusField ?? "active";
  const columns = getTableColumns(table) as Record<string, DrizzleColumn>;
  const sortCol = columns[sort.column === STATUS_SORT_KEY ? statusField : sort.column];
  const orderBy = sort.dir === "asc" ? asc(sortCol) : desc(sortCol);

  const spec = facetsFor(def, dynamicOptions);
  const { condition, page } = parseFilterState(spec, sp);

  // Resolver over this resource's own columns, with two cases the generic map
  // can't express: `status` is whichever column this table uses for retire/
  // restore, and plan membership lives in a join table, so it filters by
  // existence rather than by a column on the row.
  const joinFor: Record<string, { table: string; fk: string }> = {
    dishes: { table: "dish_plans", fk: "dish_id" },
    "dish-categories": { table: "category_plans", fk: "category_id" },
  };
  const baseResolver = columnResolver(columns as Record<string, PgColumn>);
  const resolver: FilterResolver = (f) => {
    if (f.field === "status") {
      const vals = (Array.isArray(f.value) ? f.value : [f.value]) as string[];
      if (vals.length !== 1) return undefined; // both or neither → no constraint
      return eq(columns[statusField], vals[0] === "active");
    }
    if (f.field === "planIds") {
      const vals = (Array.isArray(f.value) ? f.value : [f.value]) as string[];
      const join = joinFor[resource];
      if (!vals.length || !join) return undefined;
      return sql`exists (
        select 1 from ${sql.identifier(join.table)} j
        join plans p on p.id = j.plan_id
        where j.${sql.identifier(join.fk)} = ${columns.id}
          and p.public_id in ${vals}
      )`;
    }
    return baseResolver(f);
  };

  const where = conditionToSql(condition, resolver);
  const [{ count: total }] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(table)
    .where(where);

  const raw = (await db
    .select()
    .from(table)
    .where(where)
    .orderBy(orderBy)
    .limit(page.size)
    .offset(page.page * page.size)) as Record<string, unknown>[];
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
        tuAmount: String(it.tuAmount),
        maxTuAmount: it.maxTuAmount == null ? "" : String(it.maxTuAmount),
      });
      itemsByMealSize.set(it.mealSizeId, bucket);
    }
    rows.forEach((dto, i) => {
      const id = raw[i].id as bigint;
      dto.planId = planPublicById.get(raw[i].planId as bigint) ?? "";
      dto.items = itemsByMealSize.get(id) ?? [];
    });
  }

  // Dishes and slots carry plan membership in a join table, so the generic
  // column flatten can't see it. Hydrate planIds (plan publicIds — the same
  // space the dropdown options use) so the multiselect preselects and the table
  // can render which plans each row serves.
  if (resource === "dishes" || resource === "dish-categories") {
    const byRow =
      resource === "dishes"
        ? await dishesService.plansByDish()
        : await dishCategoriesService.plansByCategory();
    for (const dto of rows) dto.planIds = byRow.get(dto.publicId) ?? [];
  }

  return (
    <ResourceEditor
      resource={resource}
      rows={rows}
      dynamicOptions={dynamicOptions}
      sort={sort}
      categoriesByPlan={categoriesByPlan}
      spec={spec}
      total={total}
      page={page.page}
      size={page.size}
    />
  );
}
