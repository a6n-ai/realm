import { asc, eq, inArray, sql, type Column as DrizzleColumn, type SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import type { FilterCondition } from "@foundry/commons/model/condition";
import { zonedDateIso } from "@foundry/commons";
import { db } from "@/db/client";
import { addons, deliveryFrequencies, dishCategories, discounts, dishes, durationPackages, mealSizeItems, mealSizes, plans } from "@/db/schema";
import { getAppSettings } from "@/lib/settings";
import { dishCategoriesService } from "@/lib/menu/dish-categories.service";

type CategoryRow = Awaited<ReturnType<typeof dishCategoriesService.enabledCategories>>[number];
export type PlanRow = { id: bigint; publicId: string; name: string; active: boolean };
export type DiscountTargetRows = [
  { id: bigint; publicId: string; name: string }[],
  { id: bigint; publicId: string; weeks: number }[],
  { publicId: string; name: string }[],
];

export interface CatalogLoadCtx {
  categoryRows: CategoryRow[];
  allPlanRows: PlanRow[];
  planRows: PlanRow[];
  targetRows: DiscountTargetRows | null;
}

export type CompositionCategoryOption = { value: string; label: string; tuUnitType: "weight" | "count"; tuUnitSize: number; tuUnitLabel: string };
export type DishName = { id: string; name: string; planName: string; active: boolean };

export interface EditorExtras {
  /** Options for fields with FieldDef.scopedBy: field key, then the parent field's value. */
  scopedOptions?: Record<string, Record<string, { value: string; label: string }[]>>;
  compositionCategories?: CompositionCategoryOption[];
  plansByCategory?: Record<string, { value: string; label: string }[]>;
  dishNames?: DishName[];
}

export type CatalogRow = Record<string, unknown> & { publicId: string };

export interface ResourceHooks {
  table: PgTable;
  /** Always-on list filter: rows staff must never see or edit through this resource. */
  scope?: SQL;
  /** Load every plan even when no field's options come from plans. */
  needsPlans?: boolean;
  /** A facet the generic column resolver cannot express. Null = not handled here. */
  filter?: (f: FilterCondition, columns: Record<string, DrizzleColumn>) => { sql: SQL | undefined } | null;
  extras?: (ctx: CatalogLoadCtx) => Promise<EditorExtras>;
  /** Fill in what the generic column flatten cannot see (FKs in publicId space, join tables). */
  hydrate?: (rows: CatalogRow[], raw: Record<string, unknown>[], ctx: CatalogLoadCtx) => Promise<void>;
}

const compositionOption = (c: Pick<CategoryRow, "key" | "label" | "tuUnitType" | "tuUnitLabel"> & { tuUnitSize: string | number }): CompositionCategoryOption => ({
  value: c.key, label: c.label, tuUnitType: c.tuUnitType, tuUnitSize: Number(c.tuUnitSize), tuUnitLabel: c.tuUnitLabel,
});

// Dishes and add-ons store planId as a bigint FK, so hydrate it to the publicId space the select dropdown uses.
function hydratePlanId(rows: CatalogRow[], raw: Record<string, unknown>[], ctx: CatalogLoadCtx) {
  const planPublicById = new Map(ctx.allPlanRows.map((p) => [p.id, p.publicId]));
  rows.forEach((dto, i) => {
    dto.planId = raw[i].planId == null ? "" : (planPublicById.get(raw[i].planId as bigint) ?? "");
  });
  return planPublicById;
}

export const RESOURCE_HOOKS: Record<string, ResourceHooks> = {
  dishes: {
    table: dishes,
    // Category options are scoped by the dish's own plan (category scopedBy planId), so a category not
    // attached to that plan is never offered. Sent as a map so switching the plan dropdown is instant.
    async extras(ctx) {
      const entries = await Promise.all(
        ctx.planRows.map(async (p) => [
          p.publicId,
          (await dishCategoriesService.forPlan(p.id)).map(compositionOption),
        ] as const),
      );
      // The table is paginated, so the duplicate hint needs the whole catalog, not just this page's
      // rows. Inactive included: the server rejects those too.
      const dishNames = await db.select({ id: dishes.publicId, name: dishes.name, planName: plans.name, active: dishes.active })
        .from(dishes).innerJoin(plans, eq(plans.id, dishes.planId));
      return { scopedOptions: { category: Object.fromEntries(entries) }, dishNames };
    },
    async hydrate(rows, raw, ctx) {
      hydratePlanId(rows, raw, ctx);
    },
  },
  addons: {
    table: addons,
    async hydrate(rows, raw, ctx) {
      const planPublicById = hydratePlanId(rows, raw, ctx);
      rows.forEach((dto, i) => {
        dto.fallbackPlanIds = ((raw[i].fallbackPlanIds as bigint[] | null) ?? []).flatMap((id) => planPublicById.get(id) ?? []);
      });
    },
  },
  "dish-categories": {
    table: dishCategories,
    // Plan membership lives in a join table, so it filters by existence rather than by a column on the row.
    filter(f, columns) {
      if (f.field !== "planIds") return null;
      const vals = (Array.isArray(f.value) ? f.value : [f.value]) as string[];
      if (!vals.length) return { sql: undefined };
      return {
        sql: sql`exists (
        select 1 from category_plans j
        join plans p on p.id = j.plan_id
        where j.category_id = ${columns.id}
          and p.public_id in ${vals}
      )`,
      };
    },
    // Slots carry plan membership in a join table, so hydrate planIds (plan publicIds) for the multiselect.
    async hydrate(rows) {
      const byRow = await dishCategoriesService.plansByCategory();
      for (const dto of rows) dto.planIds = byRow.get(dto.publicId) ?? [];
    },
  },
  plans: { table: plans },
  "meal-sizes": {
    table: mealSizes,
    // Custom meal sizes are per-customer compositions managed under Catalog → Custom Meals; the
    // generic Meal Sizes list must never show (or let staff edit) them.
    scope: eq(mealSizes.custom, false),
    needsPlans: true,
    // Composition rows: category comes FIRST (not every category is attached to every plan), then the
    // plan select is scoped to whichever plans that category actually belongs to (category_plans).
    async extras(ctx) {
      const planPublicIdsByCategoryKey = await dishCategoriesService.plansByCategoryKey();
      const planByPublicId = new Map(ctx.planRows.map((p) => [p.publicId, p]));
      const plansByCategory: Record<string, { value: string; label: string }[]> = {};
      for (const c of ctx.categoryRows) {
        plansByCategory[c.key] = (planPublicIdsByCategoryKey.get(c.key) ?? []).flatMap((pubId) => {
          const p = planByPublicId.get(pubId);
          return p ? [{ value: p.publicId, label: p.name }] : [];
        });
      }
      return { compositionCategories: ctx.categoryRows.map(compositionOption), plansByCategory };
    },
    // The plan reference is stored as a bigint FK but the editor works in plan publicId space, and the
    // composition lives in a second table. Attach each row's items ordered by sortOrder.
    async hydrate(rows, raw, ctx) {
      const planPublicById = hydratePlanId(rows, raw, ctx);
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
          role: it.role,
        });
        itemsByMealSize.set(it.mealSizeId, bucket);
      }
      rows.forEach((dto, i) => {
        dto.items = itemsByMealSize.get(raw[i].id as bigint) ?? [];
      });
    },
  },
  "delivery-frequencies": { table: deliveryFrequencies },
  "duration-packages": { table: durationPackages },
  discounts: {
    table: discounts,
    async hydrate(rows, raw, ctx) {
      const { targetRows } = ctx;
      if (!targetRows) return;
      const { timezone } = await getAppSettings();
      const publicById = new Map<bigint, string>([...targetRows[0], ...targetRows[1]].map((t) => [t.id, t.publicId]));
      rows.forEach((dto, i) => {
        const r = raw[i];
        dto.targetId = r.targetId == null ? "all" : (publicById.get(r.targetId as bigint) ?? "");
        dto.startsAt = r.startsAt == null ? "" : zonedDateIso(Number(r.startsAt), timezone);
        dto.endsAt = r.endsAt == null ? "" : zonedDateIso(Number(r.endsAt), timezone);
      });
    },
  },
};
