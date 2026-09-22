import { Suspense } from "react";
import { notFound } from "next/navigation";
import { UtensilsCrossedIcon } from "lucide-react";
import { asc, desc, eq, getTableColumns, inArray, sql, type Column as DrizzleColumn } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import { addonCategories, addons, deliveryFrequencies, deliveryZones, dishCategories, discounts, dishes, durationPackages, mealSizeItems, mealSizes, plans, pricingTiers } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/guards";
import { dishCategoriesService } from "@/lib/services/dish-categories.service";
import { dishesService } from "@/lib/services/dishes.service";
import { columnResolver, conditionToSql, type FilterResolver } from "@foundry/database";
import { parseFilterState, type FacetDef } from "@foundry/design-system";
import { zonedDateIso } from "@foundry/commons";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { parseSort } from "@/lib/list/sort";
import { PageHeader, PageShell, SectionCard } from "@/components/ds";
import { RESOURCES, WEEKDAY_OPTIONS, WEEKDAY_LABELS, type FieldType, type ResourceDef } from "../resource-config";
import { ResourceEditor, ResourceEditorSkeleton, type DiscountCtx } from "./resource-editor";
import { loadDiscountData } from "../discounts/load";

const TABLES: Record<string, PgTable> = {
  dishes,
  "dish-categories": dishCategories,
  plans,
  "meal-sizes": mealSizes,
  "delivery-frequencies": deliveryFrequencies,
  "duration-packages": durationPackages,
  discounts,
  "delivery-zones": deliveryZones,
  "pricing-tiers": pricingTiers,
  "addon-categories": addonCategories,
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
    // targetId holds a bigint soft ref, not the publicId the options carry.
    if (f.optionsSource === "discount-targets") continue;
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
  // "plans" is needed either for a dynamicOptions field or for meal-sizes'
  // categoriesByPlan — fetched once and shared between both, instead of once
  // per consumer.
  const needsPlans = def.fields.some((f) => f.optionsSource === "plans") || resource === "meal-sizes";
  const needsAddonCategories = def.fields.some((f) => f.optionsSource === "addon-categories");
  // meal-sizes also needs every plan (active or not) to resolve a row's planId
  // FK to a publicId below — fetch the superset once and derive the
  // active-only dropdown options from it, rather than two separate queries.
  const needsTargets = def.fields.some((f) => f.optionsSource === "discount-targets");
  const [categoryRows, allPlanRows, addonCatRows, targetRows] = await Promise.all([
    needsCategories ? dishCategoriesService.enabledCategories() : Promise.resolve([]),
    // Dropdown value is the plan publicId — the same identifier the meal-size
    // service resolves back to plans.id on write.
    needsPlans
      ? db.select({ id: plans.id, publicId: plans.publicId, name: plans.name, active: plans.active }).from(plans)
      : Promise.resolve([]),
    // addons.category (soft ref) uses the key; dish-categories.addonCategoryIds
    // (join membership) uses the publicId — same split as dishes.category vs
    // dishes.planIds above.
    needsAddonCategories
      ? db.select({ publicId: addonCategories.publicId, key: addonCategories.key, name: addonCategories.name }).from(addonCategories).where(eq(addonCategories.active, true))
      : Promise.resolve([]),
    needsTargets
      ? Promise.all([
          db.select({ id: deliveryFrequencies.id, publicId: deliveryFrequencies.publicId, name: deliveryFrequencies.name }).from(deliveryFrequencies),
          db.select({ id: durationPackages.id, publicId: durationPackages.publicId, weeks: durationPackages.weeks }).from(durationPackages).orderBy(asc(durationPackages.weeks)),
        ])
      : Promise.resolve(null),
  ]);
  const planRows = allPlanRows.filter((p) => p.active);
  const dynamicOptions: Record<string, { value: string; label: string }[]> = {};
  for (const f of def.fields) {
    if (f.optionsSource === "categories") {
      dynamicOptions[f.key] = categoryRows.map((c) => ({ value: c.key, label: c.label }));
    } else if (f.optionsSource === "weekdays") {
      dynamicOptions[f.key] = WEEKDAY_OPTIONS.map((d) => ({ value: d, label: WEEKDAY_LABELS[d] }));
    } else if (f.optionsSource === "plans") {
      dynamicOptions[f.key] = planRows.map((p) => ({ value: p.publicId, label: p.name }));
    } else if (f.optionsSource === "addon-categories") {
      dynamicOptions[f.key] = addonCatRows.map((a) => ({ value: resource === "addons" ? a.key : a.publicId, label: a.name }));
    } else if (f.optionsSource === "discount-targets" && targetRows) {
      dynamicOptions[f.key] = [
        { value: "all", label: "All" },
        ...targetRows[0].map((t) => ({ value: t.publicId, label: t.name, group: "delivery" })),
        ...targetRows[1].map((t) => ({ value: t.publicId, label: `${t.weeks} weeks`, group: "duration" })),
      ] as { value: string; label: string }[];
    }
  }

  const sp = await searchParams;
  // Composition rows offer the slots of the plan the meal size is scoped to, so
  // a veg meal size can't be built out of healthy-plan slots. Sent as a map
  // rather than fetched per change, so switching the plan dropdown is instant.
  let categoriesByPlan: Record<string, { value: string; label: string; tuUnitType: "weight" | "count"; tuUnitSize: number; tuUnitLabel: string }[]> | undefined;
  if (resource === "meal-sizes") {
    const entries = await Promise.all(
      planRows.map(async (p) => [
        p.publicId,
        (await dishCategoriesService.forPlan(p.id)).map((c) => ({
          value: c.key,
          label: c.label,
          tuUnitType: c.tuUnitType,
          tuUnitSize: Number(c.tuUnitSize),
          tuUnitLabel: c.tuUnitLabel,
        })),
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
  // restore, and dish-categories' plan membership lives in a join table, so it
  // filters by existence rather than by a column on the row. Dishes has a direct
  // planId FK now, so its planId filter falls through to baseResolver.
  const baseResolver = columnResolver(columns as Record<string, PgColumn>);
  const resolver: FilterResolver = (f) => {
    if (f.field === "status") {
      const vals = (Array.isArray(f.value) ? f.value : [f.value]) as string[];
      if (vals.length !== 1) return undefined; // both or neither → no constraint
      return eq(columns[statusField], vals[0] === "active");
    }
    if (f.field === "planIds" && resource === "dish-categories") {
      const vals = (Array.isArray(f.value) ? f.value : [f.value]) as string[];
      if (!vals.length) return undefined;
      return sql`exists (
        select 1 from category_plans j
        join plans p on p.id = j.plan_id
        where j.category_id = ${columns.id}
          and p.public_id in ${vals}
      )`;
    }
    return baseResolver(f);
  };

  const where = conditionToSql(condition, resolver);
  const [[{ count: total }], raw] = await Promise.all([
    db.select({ count: sql<number>`cast(count(*) as int)` }).from(table).where(where),
    db
      .select()
      .from(table)
      .where(where)
      .orderBy(orderBy)
      .limit(page.size)
      .offset(page.page * page.size) as Promise<Record<string, unknown>[]>,
  ]);
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

  if (resource === "discounts" && targetRows) {
    const { timezone } = await getAppSettings();
    const publicById = new Map<bigint, string>([...targetRows[0], ...targetRows[1]].map((t) => [t.id, t.publicId]));
    rows.forEach((dto, i) => {
      const r = raw[i];
      dto.targetId = r.targetId == null ? "all" : (publicById.get(r.targetId as bigint) ?? "");
      dto.startsAt = r.startsAt == null ? "" : zonedDateIso(Number(r.startsAt), timezone);
      dto.endsAt = r.endsAt == null ? "" : zonedDateIso(Number(r.endsAt), timezone);
    });
  }

  // Meal sizes carry two things the generic flatten can't: the plan reference is
  // stored as a bigint FK but the editor works in plan publicId space, and the
  // composition lives in a second table. Resolve planId → publicId (so the plan
  // dropdown preselects) and attach each row's items ordered by sortOrder.
  if (resource === "meal-sizes") {
    const planPublicById = new Map(allPlanRows.map((p) => [p.id, p.publicId]));
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
        planId: planPublicById.get(it.planId) ?? "",
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

  // Dishes has a direct planId FK (bigint), so hydrate it to the publicId space
  // the select dropdown uses — same pattern as meal-sizes' planId above.
  if (resource === "dishes") {
    const planPublicById = new Map(allPlanRows.map((p) => [p.id, p.publicId]));
    rows.forEach((dto, i) => {
      dto.planId = planPublicById.get(raw[i].planId as bigint) ?? "";
    });
  }
  // Slots carry plan membership in a join table, so the generic column flatten
  // can't see it. Hydrate planIds (plan publicIds) so the multiselect preselects.
  if (resource === "dish-categories") {
    const byRow = await dishCategoriesService.plansByCategory();
    for (const dto of rows) dto.planIds = byRow.get(dto.publicId) ?? [];
  }
  if (resource === "dish-categories") {
    const addonCatByRow = await dishCategoriesService.addonCategoriesByCategory();
    for (const dto of rows) dto.addonCategoryIds = addonCatByRow.get(dto.publicId) ?? [];
  }

  let discountCtx: DiscountCtx | undefined;
  if (resource === "delivery-frequencies" || resource === "duration-packages") {
    const { freqs, durs, dtos } = await loadDiscountData();
    const kind = resource === "delivery-frequencies" ? "delivery" : "duration";
    const byTarget: DiscountCtx["byTarget"] = {};
    for (const d of dtos) if (d.kind === kind && d.targetPublicId && !byTarget[d.targetPublicId]) byTarget[d.targetPublicId] = d;
    discountCtx = { kind, options: { frequencies: freqs, durations: durs }, byTarget };
  }

  return (
    <ResourceEditor
      discountCtx={discountCtx}
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
