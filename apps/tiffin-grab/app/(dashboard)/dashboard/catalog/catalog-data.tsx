import { WEEK_DAYS } from "@/lib/menu/delivery-days";
import { pageOffset } from "@foundry/design-system/filters/parse-filter-state";
import { notFound } from "next/navigation";
import { and, asc, eq, getTableColumns, sql, type Column as DrizzleColumn } from "drizzle-orm";
import { pageOrder } from "@foundry/database";
import { PgColumn } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import { deliveryFrequencies, durationPackages, mealSizes, plans } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/guards";
import { dishCategoriesService } from "@/lib/menu/dish-categories.service";
import { columnResolver, conditionToSql, type FilterResolver } from "@foundry/database";
import { parseFilterState, type FacetDef } from "@foundry/design-system";
import { parseSort } from "@foundry/design-system/list-sort";
import { RESOURCE_HOOKS, type CatalogLoadCtx } from "@/lib/catalog/resource-hooks";
import { RESOURCES, STATUS_SORT_KEY, WEEKDAY_LABELS, sortableColumns, type ResourceDef } from "@/lib/catalog/resource-config";
import { ResourceEditor, type DiscountCtx } from "./[resource]/resource-editor";
import { loadDiscountData } from "./discounts/load";

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

export async function CatalogData({ resource, searchParams }: { resource: string; searchParams: SearchParams }) {
  await requireAdmin();
  const def: ResourceDef | undefined = RESOURCES[resource];
  const hooks = RESOURCE_HOOKS[resource];
  if (!def || !hooks) notFound();
  const { table } = hooks;

  const needsCategories = def.fields.some((f) => f.optionsSource === "categories");
  // "plans" is needed either for a dynamicOptions field or for a resource's editor
  // extras — fetched once and shared between both, instead of once per consumer.
  const needsPlans = def.fields.some((f) => f.optionsSource === "plans") || hooks.needsPlans;
  // meal-sizes also needs every plan (active or not) to resolve a row's planId
  // FK to a publicId below — fetch the superset once and derive the
  // active-only dropdown options from it, rather than two separate queries.
  const needsTargets = def.fields.some((f) => f.optionsSource === "discount-targets");
  const [categoryRows, allPlanRows, targetRows] = await Promise.all([
    needsCategories ? dishCategoriesService.enabledCategories() : Promise.resolve([]),
    // Dropdown value is the plan publicId — the same identifier the meal-size
    // service resolves back to plans.id on write.
    needsPlans
      ? db.select({ id: plans.id, publicId: plans.publicId, name: plans.name, active: plans.active }).from(plans)
      : Promise.resolve([]),
    needsTargets
      ? Promise.all([
          db.select({ id: deliveryFrequencies.id, publicId: deliveryFrequencies.publicId, name: deliveryFrequencies.name }).from(deliveryFrequencies),
          db.select({ id: durationPackages.id, publicId: durationPackages.publicId, weeks: durationPackages.weeks }).from(durationPackages).orderBy(asc(durationPackages.weeks)),
          db.select({ publicId: mealSizes.publicId, name: mealSizes.name }).from(mealSizes).where(RESOURCE_HOOKS["meal-sizes"].scope).orderBy(asc(mealSizes.name)),
        ])
      : Promise.resolve(null),
  ]);
  const planRows = allPlanRows.filter((p) => p.active);
  const dynamicOptions: Record<string, { value: string; label: string }[]> = {};
  for (const f of def.fields) {
    if (f.optionsSource === "categories") {
      dynamicOptions[f.key] = categoryRows.map((c) => ({ value: c.key, label: c.label }));
    } else if (f.optionsSource === "weekdays") {
      dynamicOptions[f.key] = WEEK_DAYS.map((d) => ({ value: d, label: WEEKDAY_LABELS[d] }));
    } else if (f.optionsSource === "plans") {
      dynamicOptions[f.key] = planRows.map((p) => ({ value: p.publicId, label: p.name }));
    } else if (f.optionsSource === "discount-targets" && targetRows) {
      dynamicOptions[f.key] = [
        { value: "all", label: "All" },
        ...targetRows[0].map((t) => ({ value: t.publicId, label: t.name, group: "delivery" })),
        ...targetRows[1].map((t) => ({ value: t.publicId, label: `${t.weeks} weeks`, group: "duration" })),
        ...targetRows[2].map((t) => ({ value: t.publicId, label: t.name, group: "meal_size" })),
      ] as { value: string; label: string }[];
    }
  }

  const sp = await searchParams;
  const ctx: CatalogLoadCtx = { categoryRows, allPlanRows, planRows, targetRows };
  const extras = (await hooks.extras?.(ctx)) ?? {};

  const allowed = sortableColumns(def);
  const sort = parseSort(sp, allowed, { column: allowed[0], dir: "asc" });

  const statusField = def.statusField ?? "active";
  const columns = getTableColumns(table) as Record<string, DrizzleColumn>;
  const sortCol = columns[sort.column === STATUS_SORT_KEY ? statusField : sort.column];
  const orderBy = pageOrder(sort.dir, sortCol, columns.id);

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
    const own = hooks.filter?.(f, columns);
    if (own) return own.sql;
    return baseResolver(f);
  };

  const where = and(conditionToSql(condition, resolver), hooks.scope);
  const [[{ count: total }], raw] = await Promise.all([
    db.select({ count: sql<number>`cast(count(*) as int)` }).from(table).where(where),
    db
      .select()
      .from(table)
      .where(where)
      .orderBy(...orderBy)
      .limit(page.size)
      .offset(pageOffset(page.page, page.size)) as Promise<Record<string, unknown>[]>,
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

  await hooks.hydrate?.(rows, raw, ctx);

  let discountCtx: DiscountCtx | undefined;
  const discountKind = def.discountKind;
  if (discountKind) {
    const { freqs, durs, sizes, dtos } = await loadDiscountData();
    const kind = discountKind;
    const byTarget: DiscountCtx["byTarget"] = {};
    for (const d of dtos) if (d.kind === kind && d.targetPublicId && !byTarget[d.targetPublicId]) byTarget[d.targetPublicId] = d;
    discountCtx = { kind, options: { frequencies: freqs, durations: durs, mealSizes: sizes }, byTarget };
  }

  return (
    <ResourceEditor
      discountCtx={discountCtx}
      resource={resource}
      rows={rows}
      dynamicOptions={dynamicOptions}
      sort={sort}
      extras={extras}
      spec={spec}
      total={total}
      page={page.page}
      size={page.size}
    />
  );
}
