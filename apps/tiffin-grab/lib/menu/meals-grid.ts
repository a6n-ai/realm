import { and, asc, eq, inArray } from "drizzle-orm";
import { cutoffMsFor } from "@tiffin/commons";
import { db } from "@/db/client";
import { dishes, mealSlots, menuWeeks, plans } from "@/db/schema";
import { orderDeliveryDays, visibleSlots } from "./delivery-days";
import { comingWeekStartIso, subscriptionDeliveryDates, type DayOfWeek, type DeliveryDate } from "./delivery-dates";
import { selectionsService } from "./selections.service";
import { menuService } from "@/lib/services/menu.service";

export type GridCell = {
  day: DayOfWeek;
  dateIso: string;
  slot: string;
  personIndex: number;
  selectedDishId: string | null;
  isDefaulted: boolean;
  dishes: { id: string; name: string; diet: "veg" | "nonveg" }[];
  locked: boolean;
};

export type WeekDateView = DeliveryDate & { lockMs: number; locked: boolean };

export type MealOrder = {
  id: bigint;
  publicId: string;
  planId: bigint;
  persons: number;
  mealSlots: string[];
  includeSaturday: boolean;
  includeSunday: boolean;
  startDate: string;
  durationWeeks: number;
  frequencyKey: string;
  pausedFrom?: string | null;
  pausedUntil?: string | null;
};

export type MealsGridResult =
  | { empty: "no-week" | "no-dates" }
  | {
      empty: null;
      releasedWeek: typeof menuWeeks.$inferSelect;
      weekDatesView: WeekDateView[];
      grid: GridCell[];
      enabledSlots: { key: string; label: string; sortOrder: number }[];
      persons: number;
    };

export async function buildMealsGrid(
  order: MealOrder,
  settings: { timezone: string; cutoffHour: number },
): Promise<MealsGridResult> {
  const { timezone, cutoffHour } = settings;
  const comingMonday = comingWeekStartIso(Date.now(), timezone);

  const [releasedWeek] = await db
    .select()
    .from(menuWeeks)
    .where(and(eq(menuWeeks.status, "released"), eq(menuWeeks.weekStart, comingMonday)))
    .limit(1);
  if (!releasedWeek) return { empty: "no-week" };

  const deliveryDays = orderDeliveryDays({
    frequencyKey: order.frequencyKey,
    includeSaturday: order.includeSaturday,
    includeSunday: order.includeSunday,
  });
  const pauseWindow =
    order.pausedFrom && order.pausedUntil
      ? { from: order.pausedFrom, until: order.pausedUntil }
      : undefined;
  const subDates = subscriptionDeliveryDates({
    startDate: order.startDate,
    durationWeeks: order.durationWeeks,
    deliveryDays,
    pauseWindow,
  });
  const weekDates = subDates.filter((d) => d.weekStartIso === releasedWeek.weekStart);
  if (weekDates.length === 0) return { empty: "no-dates" };

  const [planRow] = await db
    .select({ key: plans.key })
    .from(plans)
    .where(eq(plans.id, order.planId))
    .limit(1);
  const planKey = planRow?.key ?? "mixed";
  const allowedDiets: ("veg" | "nonveg")[] =
    planKey === "veg" ? ["veg"] : planKey === "halal_nonveg" ? ["nonveg"] : ["veg", "nonveg"];

  const { items: allItems } = await menuService.weekWithItems(releasedWeek.publicId);
  const allDishBigintIds = [...new Set(allItems.map((i) => i.dishId))];
  const [allSlotsRows, picks, dishRows] = await Promise.all([
    db
      .select({ key: mealSlots.key, label: mealSlots.label, sortOrder: mealSlots.sortOrder })
      .from(mealSlots)
      .orderBy(asc(mealSlots.sortOrder)),
    selectionsService.effectiveSelections(order.id, releasedWeek.id),
    allDishBigintIds.length > 0
      ? db
          .select({ id: dishes.publicId, bigintId: dishes.id, name: dishes.name, diet: dishes.diet })
          .from(dishes)
          .where(inArray(dishes.id, allDishBigintIds))
          .orderBy(asc(dishes.name))
      : Promise.resolve([]),
  ]);

  const dishMap = new Map(dishRows.map((d) => [d.bigintId, { id: d.id, name: d.name, diet: d.diet }]));
  const dishPublicIdByBigintId = new Map(dishRows.map((d) => [d.bigintId, d.id]));
  const purchasedSlotKeys = new Set(order.mealSlots);
  const enabledSlots = allSlotsRows.filter((s) => purchasedSlotKeys.has(s.key));

  const weekDatesView: WeekDateView[] = weekDates.map((d) => {
    const lockMs = cutoffMsFor(d.dateIso, cutoffHour, timezone);
    return { ...d, lockMs, locked: Date.now() > lockMs };
  });

  const grid: GridCell[] = [];
  for (const { dateIso, dayOfWeek: day, locked } of weekDatesView) {
    const dayItems = allItems.filter((i) => i.dayOfWeek === day);
    const slots = visibleSlots(order.mealSlots, order.mealSlots, dayItems);
    for (const slot of slots) {
      const slotItems = dayItems.filter((i) => i.slot === slot);
      const slotDishes = slotItems
        .map((i) => dishMap.get(i.dishId))
        .filter(
          (d): d is { id: string; name: string; diet: "veg" | "nonveg" } =>
            !!d && allowedDiets.includes(d.diet),
        );
      if (slotDishes.length === 0) continue;
      for (let p = 1; p <= order.persons; p++) {
        const pick = picks.find(
          (sel) => sel.dayOfWeek === day && sel.slot === slot && sel.personIndex === p,
        );
        let selectedDishId: string | null = null;
        let isDefaulted = false;
        if (pick) {
          selectedDishId = dishPublicIdByBigintId.get(pick.dishId) ?? null;
        } else {
          const defaultItem = slotItems.find((i) => i.isDefault);
          selectedDishId = defaultItem ? (dishPublicIdByBigintId.get(defaultItem.dishId) ?? null) : null;
          isDefaulted = selectedDishId !== null;
        }
        grid.push({ day, dateIso, slot, personIndex: p, selectedDishId, isDefaulted, dishes: slotDishes, locked });
      }
    }
  }
  return { empty: null, releasedWeek, weekDatesView, grid, enabledSlots, persons: order.persons };
}
