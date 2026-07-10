import { and, asc, eq, inArray } from "drizzle-orm";
import { cutoffMsFor } from "@realm/commons";
import { db } from "@/db/client";
import { dishes, menuWeeks, plans } from "@/db/schema";
import { orderDeliveryDays } from "./delivery-days";
import { comingWeekStartIso, subscriptionDeliveryDates, type DayOfWeek, type DeliveryDate } from "./delivery-dates";
import { dietsForPlanKey } from "./selections.service";
import { resolveDeliveryMealsForWeek, resolvedMealsWeekKey } from "./resolve-delivery-meal";
import { menuService } from "@/lib/services/menu.service";
import { dishCategoriesService } from "@/lib/services/dish-categories.service";

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
  const subDates = subscriptionDeliveryDates({
    startDate: order.startDate,
    durationWeeks: order.durationWeeks,
    deliveryDays,
  });
  const weekDates = subDates.filter((d) => d.weekStartIso === releasedWeek.weekStart);
  if (weekDates.length === 0) return { empty: "no-dates" };

  const [planRow] = await db
    .select({ key: plans.key, planType: plans.planType, counts: plans.categoryCounts })
    .from(plans)
    .where(eq(plans.id, order.planId))
    .limit(1);
  const planKey = planRow?.key ?? "mixed";
  const allowedDiets = dietsForPlanKey(planKey);

  const { items: allItems } = await menuService.weekWithItems(releasedWeek.publicId);
  const allDishBigintIds = [...new Set(allItems.map((i) => i.dishId))];
  const [categories, weekResolved, dishRows] = await Promise.all([
    dishCategoriesService.forPlanType((planRow?.planType ?? "tiffin") as "tiffin" | "healthy"),
    // Single source of truth for selected/resolved dish per (day, person, category, pickIndex),
    // including stale-pick re-validation and diet filtering — buildMealsGrid must not re-derive it.
    resolveDeliveryMealsForWeek(order, releasedWeek, order.persons),
    allDishBigintIds.length > 0
      ? db
          .select({ id: dishes.publicId, bigintId: dishes.id, name: dishes.name, diet: dishes.diet })
          .from(dishes)
          .where(inArray(dishes.id, allDishBigintIds))
          .orderBy(asc(dishes.name))
      : Promise.resolve([]),
  ]);

  const dishMap = new Map(dishRows.map((d) => [d.bigintId, { id: d.id, name: d.name, diet: d.diet }]));

  const weekDatesView: WeekDateView[] = weekDates.map((d) => {
    const lockMs = cutoffMsFor(d.dateIso, cutoffHour, timezone);
    return { ...d, lockMs, locked: Date.now() > lockMs };
  });

  const grid: GridCell[] = [];
  for (const { dateIso, dayOfWeek: day, locked } of weekDatesView) {
    const dayItems = allItems.filter((i) => i.dayOfWeek === day);
    for (const cat of categories) {
      const slot = cat.key;
      // Representative resolution (person 1): diet filtering and category_counts are
      // person-independent, so whether this (day, category) renders at all doesn't vary by
      // person — only the resolved pick per pickIndex does.
      const repResolved = weekResolved.get(resolvedMealsWeekKey(day, 1))?.find((r) => r.category === slot);
      if (!repResolved) continue; // omitted: diet-filtered-empty or count=0 for this plan

      const slotItems = dayItems.filter((i) => i.slot === slot);
      const slotDishes = slotItems
        .map((i) => dishMap.get(i.dishId))
        .filter(
          (d): d is { id: string; name: string; diet: "veg" | "nonveg" } =>
            !!d && allowedDiets.includes(d.diet),
        );

      for (let p = 1; p <= order.persons; p++) {
        const resolved = weekResolved.get(resolvedMealsWeekKey(day, p))?.find((r) => r.category === slot);
        if (!cat.selectable) {
          // Fixed category: a single read-only cell — no picker, quantity is the plan's count.
          // `dishes` carries just the resolved dish (not the full slot menu) so the UI can
          // render its name without offering a picker.
          const pick = resolved?.picks[0];
          const pickDish = pick ? dishMap.get(pick.dishId) : undefined;
          grid.push({
            day, dateIso, slot, personIndex: p, pickIndex: 1, selectable: false, quantity: repResolved.quantity,
            selectedDishId: pick?.dishPublicId ?? null, isDefaulted: pick?.isDefaulted ?? false,
            dishes: pickDish ? [pickDish] : [], locked,
          });
          continue;
        }
        // Selectable category: one picker cell per pickIndex, resolved pick → isDefault fallback.
        for (let pickIndex = 1; pickIndex <= repResolved.quantity; pickIndex++) {
          const pick = resolved?.picks[pickIndex - 1];
          grid.push({
            day, dateIso, slot, personIndex: p, pickIndex, selectable: true, quantity: 1,
            selectedDishId: pick?.dishPublicId ?? null, isDefaulted: pick?.isDefaulted ?? false,
            dishes: slotDishes, locked,
          });
        }
      }
    }
  }
  return { empty: null, releasedWeek, weekDatesView, grid, categories, persons: order.persons };
}
