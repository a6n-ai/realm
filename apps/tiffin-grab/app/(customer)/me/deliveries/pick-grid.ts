"use server";

import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveries, deliveryCategorySwaps, deliveryFrequencies, mealSizeItems, orders } from "@/db/schema";
import { assertCanManageOrder } from "@/lib/services/customer-deliveries.service";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { dishCategoriesService } from "@/lib/services/dish-categories.service";
import { mondayOfIso } from "@/lib/menu/delivery-dates";
import { buildMealsGrid, type GridCell } from "@/lib/menu/meals-grid";
import { listRuleTextsForOrder } from "@/lib/menu/rule-texts";
import { mealRulesService } from "@/lib/services/meal-rules.service";
import type { MealRule } from "@/lib/menu/meal-rule-types";
import { categoryCountsFromItems, portionsByCategory, type PortionSwap } from "@/lib/menu/pick-size";
import { foldProvisionalCells, previewPortions, type PreviewBase } from "@/lib/menu/pick-preview";
import { loadCompositionContext } from "@/lib/services/swap-options.service";
import type { TuCategory } from "@/lib/menu/format-tu";
import { swapAppliesTo } from "@/lib/menu/coverage";
import { carryingTrips } from "@/lib/menu/trip-lookup";
import { AppError } from "@foundry/commons";

export type PickGrid = {
  cells: GridCell[];
  categories: { key: string; label: string; selectable: boolean; sortOrder: number }[];
  /**
   * Human portions per category for the base meal size (no swaps). Prefer
   * `portionsByDate[eatingDate]` after swaps so Pick stays consistent with Swap.
   */
  portionsBySlot: Record<string, (string | null)[]>;
  /** Swap-aware portions keyed by eating date ISO. */
  portionsByDate: Record<string, Record<string, (string | null)[]>>;
  /** Each category's dishes per eating date, including categories swaps emptied. */
  menu: Record<string, Record<string, GridCell["dishes"]>>;
  /** Menu week public id per eating date; the pick actions need it. */
  weekByDate: Record<string, string>;
  persons: number;
  /**
   * The meal rules that apply to this order, as sentences. Shown together above
   * the picker so a customer knows the limits before choosing, and highlighted
   * by `publicId` when one of them refuses a pick.
   */
  rules: { publicId: string; text: string }[];
  /** The same rules, structured, so the sheet can hide dishes a save would refuse. */
  mealRules: MealRule[];
  /** Loaded once so the sheet previews swaps locally instead of reloading the grid per tap. */
  preview: PreviewBase;
};

function mapPortions(portions: Map<string, (string | null)[]>): Record<string, (string | null)[]> {
  return Object.fromEntries([...portions.entries()].map(([k, slots]) => [k, slots]));
}

/** The meals grid for the eating days one trip covers (at most two menu weeks), trimmed so the sheet payload stays small. */
export async function loadPickGrid(
  orderId: string,
  dates: string[],
  opts: {
    /** Swaps chosen in the sheet but not written yet — folded into cells and portions. */
    provisionalSwaps?: { forDate: string; fromCategory: string; toCategory: string; qtyFrom: number; qtyTo: number; fromRow?: number | null }[];
    /** Applied swaps the sheet has marked for undo on Done — excluded from portions. */
    omitSwapPublicIds?: string[];
  } = {},
): Promise<{ ok: true; grid: PickGrid | null } | { error: string }> {
  try {
    await assertCanManageOrder(orderId);
    const [row] = await db
      .select({
        id: orders.id, publicId: orders.publicId, planId: orders.planId, mealSizeId: orders.mealSizeId, persons: orders.persons,
        categoryCounts: orders.categoryCounts, mealSlots: orders.mealSlots, startDate: orders.startDate, durationWeeks: orders.durationWeeks,
      })
      .from(orders)
      .innerJoin(deliveryFrequencies, eq(orders.frequencyId, deliveryFrequencies.id))
      .where(eq(orders.publicId, orderId))
      .limit(1);
    if (!row) return { ok: true, grid: null };
    const settings = await getAppSettings();
    const grid: PickGrid = {
      cells: [],
      categories: [],
      portionsBySlot: {},
      portionsByDate: {},
      menu: {},
      weekByDate: {},
      persons: row.persons,
      rules: await listRuleTextsForOrder(row.planId, row.mealSizeId),
      mealRules: await mealRulesService.listEnabledForOrder({ planId: row.planId, mealSizeId: row.mealSizeId }),
      preview: { items: [], tu: [], appliedByDate: {}, composition: { baseCounts: {}, mealSizeItems: [], categories: [] }, pairs: [] },
    };

    // Natural portions from meal_size_items × category TU (formatTuHuman) — never hardcoded.
    const [items, planCats] = await Promise.all([
      db
        .select({ category: mealSizeItems.category, tuAmount: mealSizeItems.tuAmount, sortOrder: mealSizeItems.sortOrder })
        .from(mealSizeItems)
        .where(eq(mealSizeItems.mealSizeId, row.mealSizeId))
        .orderBy(asc(mealSizeItems.sortOrder)),
      dishCategoriesService.forPlan(row.planId),
    ]);
    const tuByKey = new Map<string, TuCategory>();
    for (const c of planCats) {
      tuByKey.set(c.key, {
        tuUnitType: c.tuUnitType,
        tuUnitSize: Number(c.tuUnitSize),
        tuUnitLabel: c.tuUnitLabel,
        selectable: c.selectable,
      });
    }
    const basePortions = portionsByCategory(items, tuByKey);
    grid.portionsBySlot = mapPortions(basePortions);

    // Option A: Active subscriptions dynamically reflect the current admin composition.
    // If live meal_size_items differ from stored categoryCounts (e.g. admin updated composition),
    // sync row.categoryCounts to the live composition so grid cells and portion slots match 1:1.
    if (items.length > 0) {
      const liveCounts = categoryCountsFromItems(items);
      const isMismatch =
        Object.keys(liveCounts).length !== Object.keys(row.categoryCounts ?? {}).length ||
        Object.entries(liveCounts).some(([k, v]) => row.categoryCounts?.[k] !== v);
      if (isMismatch) {
        row.categoryCounts = liveCounts;
        row.mealSlots = Object.keys(liveCounts);
        void db
          .update(orders)
          .set({ categoryCounts: liveCounts, mealSlots: row.mealSlots, updatedAt: Date.now() })
          .where(eq(orders.id, row.id))
          .catch(() => {});
      }
    }

    for (const monday of new Set(dates.map(mondayOfIso))) {
      const r = await buildMealsGrid(row, settings, monday);
      if (r.empty !== null) continue;
      grid.categories = r.categories;
      for (const d of r.weekDatesView) if (dates.includes(d.dateIso)) grid.weekByDate[d.dateIso] = r.releasedWeek.publicId;
      grid.cells.push(...r.grid.filter((c) => dates.includes(c.dateIso)));
      for (const d of dates) if (r.menu[d]) grid.menu[d] = r.menu[d];
    }
    if (!grid.cells.length) return { ok: true, grid: null };

    // Per eating day: fold that day's applied swaps so Pick portions match Swap / labels.
    const eatingDates = [...new Set(grid.cells.map((c) => c.dateIso))];
    const from = eatingDates.reduce((a, b) => (a < b ? a : b));
    const until = eatingDates.reduce((a, b) => (a > b ? a : b));
    const carrying = await carryingTrips(row.id, from, until);
    const ownRows = await db
      .select({ id: deliveries.id, deliveryDate: deliveries.deliveryDate })
      .from(deliveries)
      .where(and(eq(deliveries.orderId, row.id), gte(deliveries.deliveryDate, from), lte(deliveries.deliveryDate, until)));
    const tripIds = [...new Set([...carrying.values()].map((t) => t.id).concat(ownRows.map((r) => r.id)))];
    const swapRows = tripIds.length === 0
      ? []
      : await db
        .select({
          publicId: deliveryCategorySwaps.publicId,
          deliveryId: deliveryCategorySwaps.deliveryId,
          fromCategory: deliveryCategorySwaps.fromCategory,
          toCategory: deliveryCategorySwaps.toCategory,
          qtyFrom: deliveryCategorySwaps.qtyFrom,
          qtyTo: deliveryCategorySwaps.qtyTo, fromRow: deliveryCategorySwaps.fromRow,
          forDate: deliveryCategorySwaps.forDate,
        })
        .from(deliveryCategorySwaps)
        .where(inArray(deliveryCategorySwaps.deliveryId, tripIds)).orderBy(asc(deliveryCategorySwaps.id));
    const ownByDate = new Map(ownRows.map((d) => [d.deliveryDate, d]));
    const omit = new Set(opts.omitSwapPublicIds ?? []);
    const provisional = opts.provisionalSwaps ?? [];

    const appliedByDate = new Map<string, PortionSwap[]>();
    for (const date of eatingDates) {
      const trip = carrying.get(date) ?? ownByDate.get(date);
      appliedByDate.set(date, trip == null
        ? []
        : swapRows
          .filter((s) =>
            s.deliveryId === trip.id
            && !omit.has(s.publicId)
            && swapAppliesTo(s.forDate, trip.deliveryDate, date),
          )
          .map((s) => ({
            fromCategory: s.fromCategory,
            toCategory: s.toCategory,
            qtyFrom: s.qtyFrom,
            qtyTo: s.qtyTo,
            fromRow: s.fromRow,
          })));
    }

    const appliedRecord = Object.fromEntries(appliedByDate);
    const [composition, pairs] = await Promise.all([
      loadCompositionContext(row.mealSizeId, row.categoryCounts ?? {}),
      dishCategoriesService.swapPairsForMealSize(row.mealSizeId),
    ]);
    grid.preview = {
      items,
      tu: [...tuByKey],
      appliedByDate: appliedRecord,
      composition: { ...composition, categories: [...composition.categories] },
      pairs,
    };
    grid.cells = foldProvisionalCells({ cells: grid.cells, categories: grid.categories, base: grid.preview, provisional });
    for (const date of eatingDates) grid.portionsByDate[date] = previewPortions(grid.preview, date, provisional);

    return { ok: true, grid };
  } catch (e) {
    if (e instanceof AppError) return { error: e.message };
    throw e;
  }
}
