import { asc, eq, inArray } from "drizzle-orm";
import { parseIsoDateUtc, weekdayKey } from "@foundry/commons";
import type { FileDetail } from "@foundry/storage/model";
import { db } from "@/db/client";
import { dishes, menuWeeks, plans } from "@/db/schema";
import { mondayOfIso, thisWeekStartIso, type DayOfWeek, type DeliveryDate } from "./delivery-dates";
import { allowedDishIdsForMealSize } from "./selections.service";
import { resolveDeliveryMealsForWeek, resolvedMealsWeekKey } from "./resolve-delivery-meal";
import { menuService } from "@/lib/services/menu.service";
import { dishCategoriesService } from "@/lib/services/dish-categories.service";
import { carryingTrips } from "./trip-lookup";
import { fullDayName } from "./coverage";
import { isContainerCategory } from "./format-tu";

export type GridCell = {
  day: DayOfWeek;
  dateIso: string;
  slot: string;
  personIndex: number;
  pickIndex: number;
  selectable: boolean;
  quantity: number;
  selectedDishId: string | null;
  isDefaulted: boolean;
  dishes: GridDish[];
  locked: boolean;
  lockNote?: string | null;
};

/** `ruleId`/`planId` are dishes.id / dishes.planId as strings — what meal rules test; absent means untestable. */
export type GridDish = { id: string; name: string; image: FileDetail | null; ruleId?: string; planId?: string };

export type WeekDateView = DeliveryDate & { lockMs: number; locked: boolean; carriedBy?: string | null; lockNote?: string | null };

/** ISO date `days` after `iso` (UTC date math, no timezone). */
function addDaysIso(iso: string, days: number): string {
  const d = parseIsoDateUtc(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export type MealOrder = {
  id: bigint;
  publicId: string;
  planId: bigint;
  mealSizeId: bigint;
  persons: number;
  categoryCounts: Record<string, number>;
  mealSlots: string[];
  startDate: string;
  durationWeeks: number;
};

export type MealsGridResult =
  | { empty: "no-week" | "no-dates" }
  | {
      empty: null;
      releasedWeek: typeof menuWeeks.$inferSelect;
      weekDatesView: WeekDateView[];
      grid: GridCell[];
      categories: { key: string; label: string; selectable: boolean; sortOrder: number }[];
      persons: number;
    };

export async function buildMealsGrid(
  order: MealOrder,
  settings: { timezone: string; cutoffHour: number },
  /** Monday of the week to build; default is the current (or order-start) week. */
  forWeekStart?: string,
): Promise<MealsGridResult> {
  // cutoffHour is intentionally unused here: lockMs/locked come from each row's own
  // stored cutoffAt (snapshotted when the delivery schedule was written), not recomputed
  // from settings at read time.
  const { timezone } = settings;

  // The plan still has to exist — categories and dish membership are both scoped to it —
  // but nothing here needs its key or plan_type any more: one week now serves every plan,
  // and what a subscriber is offered comes from membership alone.
  const [planRow] = await db
    .select({ id: plans.id })
    .from(plans)
    .where(eq(plans.id, order.planId))
    .limit(1);
  if (!planRow) throw new Error(`buildMealsGrid: order ${order.publicId} references a plan that no longer exists (planId=${order.planId})`);
  // Union of every plan this order's meal size's own composition rows target —
  // must agree with resolveDeliveryMeal/setSelection, see selections.service.ts.
  const planDishIds = await allowedDishIdsForMealSize(order.mealSizeId);

  // A brand-new subscriber's first delivery is often next week, not this one — falling back to
  // thisWeekStartIso alone would show "no-week" forever even though their actual upcoming week
  // is released and pickable. Use whichever week is later: the current calendar week (the normal
  // case, for subscribers already receiving deliveries) or the order's own start week (for a
  // subscriber who hasn't started yet). ISO date strings compare correctly with `>`.
  const thisMonday = thisWeekStartIso(Date.now(), timezone);
  const orderStartMonday = mondayOfIso(order.startDate);
  const targetMonday = forWeekStart ?? (orderStartMonday > thisMonday ? orderStartMonday : thisMonday);
  const releasedRef = await menuService.getReleasedWeek(targetMonday);
  if (!releasedRef) return { empty: "no-week" };

  const [releasedWeek] = await db.select().from(menuWeeks).where(eq(menuWeeks.id, releasedRef.id)).limit(1);
  if (!releasedWeek) return { empty: "no-week" };

  const weekStart = releasedWeek.weekStart;
  const weekEnd = addDaysIso(weekStart, 6);
  // One column per EATING date: a trip's carried days appear even though they have no row of their own.
  const carrying = await carryingTrips(order.id, weekStart, weekEnd);
  const rows = [...carrying.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
  if (rows.length === 0) return { empty: "no-dates" };

  const { items: allItems } = await menuService.weekWithItems(releasedWeek.publicId);
  const allDishBigintIds = [...new Set(allItems.map((i) => i.dishId))];
  const [categories, weekResolved, dishRows] = await Promise.all([
    dishCategoriesService.forPlan(planRow.id),
    // Single source of truth for selected/resolved dish per (day, person, category, pickIndex),
    // including stale-pick re-validation and plan filtering — buildMealsGrid must not re-derive it.
    resolveDeliveryMealsForWeek(order, releasedWeek, order.persons),
    allDishBigintIds.length > 0
      ? db
          .select({ id: dishes.publicId, bigintId: dishes.id, name: dishes.name, image: dishes.image, planId: dishes.planId })
          .from(dishes)
          .where(inArray(dishes.id, allDishBigintIds))
          .orderBy(asc(dishes.name))
      : Promise.resolve([]),
  ]);

  const dishMap = new Map<bigint, GridDish>(dishRows.map((d) => [
    d.bigintId,
    { id: d.id, name: d.name, image: d.image ?? null, ruleId: d.bigintId.toString(), planId: d.planId.toString() },
  ]));

  // Use each row's stored cutoffAt — never recomputed here. Missed-ness is decided once,
  // at materialization/reconciliation time, not re-derived at read time.
  const weekDatesView: WeekDateView[] = rows.map(([dateIso, trip]) => {
    const carried = trip.deliveryDate !== dateIso;
    return {
      dateIso,
      dayOfWeek: weekdayKey(parseIsoDateUtc(dateIso)) as DayOfWeek,
      weekStartIso: weekStart,
      lockMs: trip.cutoffAt,
      locked: Date.now() > trip.cutoffAt,
      carriedBy: carried ? trip.deliveryDate : null,
      lockNote: carried ? `Locks with ${fullDayName(trip.deliveryDate)}'s delivery` : null,
    };
  });

  const grid: GridCell[] = [];
  for (const { dateIso, dayOfWeek: day, locked, lockNote } of weekDatesView) {
    const dayItems = allItems.filter((i) => i.dayOfWeek === day);
    for (const cat of categories) {
      const slot = cat.key;
      // Representative resolution (person 1): plan filtering and category_counts are
      // person-independent, so whether this (day, category) renders at all doesn't vary by
      // person — only the resolved pick per pickIndex does.
      const repResolved = weekResolved.get(resolvedMealsWeekKey(day, 1))?.find((r) => r.category === slot);
      if (!repResolved) continue; // omitted: nothing on this plan for the slot, or count=0

      // Offer only dishes attached to this order's plan. Filtering on the menu
      // item's dish id (not on any attribute of the dish) is what keeps a
      // non-veg dish out of a vegetarian's picker.
      const slotItems = dayItems.filter((i) => i.slot === slot && planDishIds.has(i.dishId));
      const slotDishes = slotItems
        .map((i) => dishMap.get(i.dishId))
        .filter((d): d is GridDish => !!d);

      for (let p = 1; p <= order.persons; p++) {
        const resolved = weekResolved.get(resolvedMealsWeekKey(day, p))?.find((r) => r.category === slot);
        if (!cat.selectable) {
          if (isContainerCategory(cat)) {
            for (let pickIndex = 1; pickIndex <= repResolved.quantity; pickIndex++) {
              const pick = resolved?.picks[pickIndex - 1];
              const pickDish = pick ? dishMap.get(pick.dishId) : undefined;
              grid.push({
                day, dateIso, slot, personIndex: p, pickIndex, selectable: false, quantity: 1,
                selectedDishId: pick?.dishPublicId ?? null, isDefaulted: pick?.isDefaulted ?? false,
                dishes: pickDish ? [pickDish] : [], locked, lockNote,
              });
            }
          } else {
            // Fixed bulk category (e.g. roti): a single read-only cell — no picker, quantity is the plan's count.
            // `dishes` carries just the resolved dish (not the full slot menu) so the UI can
            // render its name without offering a picker.
            const pick = resolved?.picks[0];
            const pickDish = pick ? dishMap.get(pick.dishId) : undefined;
            grid.push({
              day, dateIso, slot, personIndex: p, pickIndex: 1, selectable: false, quantity: repResolved.quantity,
              selectedDishId: pick?.dishPublicId ?? null, isDefaulted: pick?.isDefaulted ?? false,
              dishes: pickDish ? [pickDish] : [], locked, lockNote,
            });
          }
          continue;
        }
        // Selectable category: one picker cell per pickIndex, resolved pick → isDefault fallback.
        for (let pickIndex = 1; pickIndex <= repResolved.quantity; pickIndex++) {
          const pick = resolved?.picks[pickIndex - 1];
          grid.push({
            day, dateIso, slot, personIndex: p, pickIndex, selectable: true, quantity: 1,
            selectedDishId: pick?.dishPublicId ?? null, isDefaulted: pick?.isDefaulted ?? false,
            dishes: slotDishes, locked, lockNote,
          });
        }
      }
    }
  }
  return { empty: null, releasedWeek, weekDatesView, grid, categories, persons: order.persons };
}
