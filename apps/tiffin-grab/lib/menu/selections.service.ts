// Resolving "what a subscriber actually receives" lives in ONE place:
// resolveCategoriesForDay (resolve-delivery-meal.ts). buildMealsGrid consumes it, and any
// future kitchen/ops/Optimo read MUST too — a second implementation will drift, and then
// the subscriber sees one meal while the kitchen packs another.
import { ValidationError } from "@foundry/commons";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveries, deliveryCategorySwaps, dishes, mealSelections, mealSizeItems, menuItems, menuWeeks, orderActivities, orders } from "@/db/schema";
import { applySwapsToCounts } from "@/lib/menu/swap-rules";
import { validateMealRules } from "@/lib/menu/meal-validation";
import { dishCategoriesService } from "@/lib/services/dish-categories.service";
import { mealRulesService } from "@/lib/services/meal-rules.service";
import { requireCategoryIds } from "@/lib/menu/category-ids";
import { mealPickNote } from "@/lib/menu/meal-pick-note";
import { carryingTrips } from "@/lib/menu/trip-lookup";
import { swapAppliesTo } from "@/lib/menu/coverage";
import { type DayOfWeek } from "@/lib/menu/delivery-dates";

type Order = typeof orders.$inferSelect;
type Week = typeof menuWeeks.$inferSelect;

const DAY_OFFSET: Record<DayOfWeek, number> = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };
const DAY_KEYS = Object.keys(DAY_OFFSET) as DayOfWeek[];

/**
 * The dish ids on a plan. Single source of truth for "what may this plan be
 * served", shared by setSelection (input validation), buildMealsGrid (option
 * filtering) and resolveDeliveryMeal (per-category filtering) so the three
 * can never disagree.
 */
export async function dishIdsForPlan(planId: bigint): Promise<Set<bigint>> {
  const rows = await db.select({ id: dishes.id }).from(dishes).where(eq(dishes.planId, planId));
  return new Set(rows.map((r) => r.id));
}

/**
 * A dish belongs to exactly one plan now, so "exclusive to this plan" is every
 * dish on it — same set as dishIdsForPlan. Kept as a separate export (rather
 * than inlining dishIdsForPlan at each call site) because callers name it for
 * the "exclusive_to_plan" meal-rule concept, not because the sets can differ.
 */
export const exclusiveDishIdsForPlan = dishIdsForPlan;

/**
 * The dish ids a subscriber on this MEAL SIZE may ever be served — the union of
 * dishIdsForPlan(planId) over every distinct plan the meal size's own
 * composition rows target, not just the order's own plan.
 *
 * This is what makes "add a second Sabzi row, tagged veg" on a non-veg meal
 * size actually reach the subscriber: a meal size can mix categories across
 * plans (e.g. non-veg thali with both a veg-tagged and a non-veg-tagged sabzi
 * slot), so the food-safety filter has to be keyed off the meal size's item
 * rows, not the order's single planId. A meal size whose items are all on one
 * plan (the common case) reduces to exactly dishIdsForPlan(that plan) — same
 * behavior as before this existed.
 */
export async function allowedDishIdsForMealSize(mealSizeId: bigint): Promise<Set<bigint>> {
  const rows = await db.selectDistinct({ planId: mealSizeItems.planId }).from(mealSizeItems).where(eq(mealSizeItems.mealSizeId, mealSizeId));
  const sets = await Promise.all(rows.map((r) => dishIdsForPlan(r.planId)));
  const out = new Set<bigint>();
  for (const s of sets) for (const id of s) out.add(id);
  return out;
}

// The ISO date of `dayOfWeek` within the menu week starting on weekStart.
function dateInWeek(weekStartIso: string, dayOfWeek: DayOfWeek): string {
  const d = new Date(`${weekStartIso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + DAY_OFFSET[dayOfWeek]);
  return d.toISOString().slice(0, 10);
}

export const selectionsService = {
  async setSelection(input: { order: Order; menuWeek: Week; dayOfWeek: DayOfWeek; slot: string; personIndex: number; pickIndex?: number; dishPublicId: string; actorId?: bigint | null }) {
    const { order, menuWeek, dayOfWeek, slot, personIndex, pickIndex = 1, dishPublicId, actorId = null } = input;
    if (order.status === "cancelled") throw new ValidationError("This order is cancelled");
    if (personIndex < 1 || personIndex > order.persons) throw new ValidationError("Invalid person");

    const deliveryDateIso = dateInWeek(menuWeek.weekStart, dayOfWeek);

    // A scheduled trip that COVERS the date is the single source of truth for day-membership AND
    // cutoff: a carried eating day (Tue on Monday's trip) has no row of its own but locks with the
    // trip. Paused/skipped/merged rows, or a date nothing covers, are not part of the order.
    const deliveryRow = (await carryingTrips(order.id, deliveryDateIso, deliveryDateIso)).get(deliveryDateIso);
    if (!deliveryRow) {
      throw new ValidationError("That day isn't part of your order");
    }
    if (Date.now() > deliveryRow.cutoffAt) {
      throw new ValidationError("Selections are locked — the cutoff for that day has passed");
    }

    const categoryId = (await requireCategoryIds([slot])).get(slot)!;

    const [dishRow] = await db.select({ id: dishes.id, name: dishes.name, planId: dishes.planId }).from(dishes).where(eq(dishes.publicId, dishPublicId)).limit(1);
    if (!dishRow) throw new ValidationError("Dish not found");
    const dishId = dishRow.id;

    const [item] = await db.select().from(menuItems).where(and(
      eq(menuItems.menuWeekId, menuWeek.id), eq(menuItems.dayOfWeek, dayOfWeek), eq(menuItems.categoryId, categoryId), eq(menuItems.dishId, dishId),
    )).limit(1);
    if (!item) throw new ValidationError("Dish is not available for that day and slot");

    // The dish must be on a plan this order's MEAL SIZE actually composes with — not
    // necessarily the order's own plan, since a meal size can mix categories across
    // plans (a non-veg thali can carry a veg-tagged sabzi slot). A dish on a plan
    // nothing in this meal size ever references is still refused.
    const allowedDishIds = await allowedDishIdsForMealSize(order.mealSizeId);
    if (!allowedDishIds.has(dishId)) throw new ValidationError("Dish does not match your plan");

    // `slot` is a dish-category key: only categories marked selectable may receive a subscriber pick,
    // and pickIndex must fall within that category's per-plan count (e.g. sabzi:2 allows picks 1 and 2).
    const cats = await dishCategoriesService.forPlan(order.planId);
    const cat = cats.find((c) => c.key === slot);
    if (!cat) throw new ValidationError("Unknown category");
    if (!cat.selectable) throw new ValidationError("This item is fixed and can't be changed");
    // Swaps on this day change how many picks a category has (daal -> sabzi = 2 sabzi); the
    // picker renders those folded counts, so validate against the same thing.
    const swaps = await db
      .select({ fromCategory: deliveryCategorySwaps.fromCategory, toCategory: deliveryCategorySwaps.toCategory, qtyFrom: deliveryCategorySwaps.qtyFrom, qtyTo: deliveryCategorySwaps.qtyTo, forDate: deliveryCategorySwaps.forDate })
      .from(deliveryCategorySwaps)
      .where(eq(deliveryCategorySwaps.deliveryId, deliveryRow.id))
      .orderBy(asc(deliveryCategorySwaps.id));
    const daySwaps = swaps.filter((s) => swapAppliesTo(s.forDate, deliveryRow.deliveryDate, deliveryDateIso));
    const max = applySwapsToCounts(order.categoryCounts ?? {}, daySwaps)[slot] ?? 0;
    if (pickIndex < 1 || pickIndex > max) throw new ValidationError("Invalid pick");

    // Meal rules (e.g. max exclusive_to_plan dishes in a category) against the
    // proposed final meal for this person/day — shared validator, not UI logic.
    const rules = await mealRulesService.listEnabledForPlan(order.planId);
    if (rules.some((r) => r.categoryKey === slot)) {
      const exclusiveDishIds = await exclusiveDishIdsForPlan(order.planId);
      const categoryIds = await requireCategoryIds(cats.map((c) => c.key));
      const catId = categoryIds.get(slot)!;
      const existing = await db
        .select({ pickIndex: mealSelections.pickIndex, dishId: mealSelections.dishId })
        .from(mealSelections)
        .where(and(
          eq(mealSelections.orderId, order.id),
          eq(mealSelections.menuWeekId, menuWeek.id),
          eq(mealSelections.dayOfWeek, dayOfWeek),
          eq(mealSelections.categoryId, catId),
          eq(mealSelections.personIndex, personIndex),
        ));
      const byPick = new Map(existing.map((e) => [e.pickIndex, e.dishId]));
      byPick.set(pickIndex, dishId);
      const picks = [...byPick.entries()].map(([pi, id]) => ({ category: slot, dishId: id, pickIndex: pi }));
      // Only count picks that still exist within the effective slot count.
      const proposed = picks.filter((p) => p.pickIndex >= 1 && p.pickIndex <= max).map(({ category, dishId: id }) => ({ category, dishId: id }));
      const ruleCheck = validateMealRules({
        rules,
        exclusiveDishIds,
        picks: proposed,
        labels: Object.fromEntries(cats.map((c) => [c.key, c.label])),
      });
      if (!ruleCheck.ok) throw new ValidationError(ruleCheck.reason);
    }

    // Read the outgoing dish BEFORE the upsert overwrites it. Without this the log could
    // only say "someone touched Tuesday" — the prior value is what answers the actual
    // question staff get asked ("why did I get paneer?").
    const [prior] = await db
      .select({ dishId: mealSelections.dishId, dishName: dishes.name })
      .from(mealSelections)
      .leftJoin(dishes, eq(dishes.id, mealSelections.dishId))
      .where(and(
        eq(mealSelections.orderId, order.id),
        eq(mealSelections.menuWeekId, menuWeek.id),
        eq(mealSelections.dayOfWeek, dayOfWeek),
        eq(mealSelections.categoryId, categoryId),
        eq(mealSelections.personIndex, personIndex),
        eq(mealSelections.pickIndex, pickIndex),
      ))
      .limit(1);

    await db.insert(mealSelections).values({ orderId: order.id, menuWeekId: menuWeek.id, dayOfWeek, categoryId, personIndex, pickIndex, dishId })
      .onConflictDoUpdate({
        target: [mealSelections.orderId, mealSelections.menuWeekId, mealSelections.dayOfWeek, mealSelections.categoryId, mealSelections.personIndex, mealSelections.pickIndex],
        set: { dishId },
      });

    // Re-picking the same dish is a no-op the customer can trigger by tapping twice —
    // logging it would bury the real changes. applyToWeek fans out over a week, so this
    // also keeps "apply to all days" from writing rows for days already on that dish.
    if (prior?.dishId === dishId) return;

    await db.insert(orderActivities).values({
      orderId: order.id,
      deliveryId: deliveryRow.id,
      type: "meal_pick",
      note: mealPickNote({
        deliveryDateIso,
        categoryLabel: cat.label,
        personIndex,
        persons: order.persons,
        from: prior?.dishName ?? null,
        to: dishRow.name,
      }),
      createdBy: actorId,
    });
  },

  async applyToWeek(input: { order: Order; menuWeek: Week; slot: string; personIndex: number; pickIndex?: number; dishPublicId: string; actorId?: bigint | null }) {
    const { order, menuWeek, slot, personIndex, pickIndex, dishPublicId, actorId } = input;

    // Eating dates come from the trips that cover them (carried days included) — the same source
    // buildMealsGrid reads. A make-up can land outside durationWeeks × deliveryDays, so dates are
    // never recomputed from the plan's schedule.
    const weekEnd = dateInWeek(menuWeek.weekStart, "sun");
    const eatingDates = [...(await carryingTrips(order.id, menuWeek.weekStart, weekEnd)).keys()].sort();
    const dateToDay = new Map<string, DayOfWeek>(DAY_KEYS.map((day) => [dateInWeek(menuWeek.weekStart, day), day]));

    let applied = 0;
    const skipped: { dateIso: string; reason: string }[] = [];
    for (const date of eatingDates) {
      const dayOfWeek = dateToDay.get(date);
      if (!dayOfWeek) continue; // defensive: carryingTrips is already bounded to this week
      try {
        await this.setSelection({ order, menuWeek, dayOfWeek, slot, personIndex, pickIndex, dishPublicId, actorId });
        applied += 1;
      } catch (e) {
        skipped.push({ dateIso: date, reason: e instanceof Error ? e.message : "Could not apply" });
      }
    }
    return { applied, skipped };
  },
};
