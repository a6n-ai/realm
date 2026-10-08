// A side item (meal_size_items.role side_1 / side_2) can take its default dish from another
// category on the day's menu, or from one fixed dish: "sabzi side_1 -> daal" packs the day's
// dal as the 8oz side of a 5 Item thali while the 12oz main stays the day's sabzi.
// menu_side_defaults is the standing rule; menu_day_sides overrides it for one menu day.
import { eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import { dishCategories, dishes, menuDaySides, menuSideDefaults } from "@/db/schema";
import type { DayOfWeek } from "@/lib/menu/delivery-dates";
import { foldSwaps, type SwapRow } from "@/lib/menu/swap-rules";

export type MealItemRole = "main" | "side_1" | "side_2";

type SideItem = { slot: string; dishId: bigint; isDefault: boolean; name: string; publicId: string; planId: bigint };

export type SideRule = { sourceCategory: string; dish?: undefined } | { sourceCategory?: undefined; dish: SideItem };

/** `${categoryKey}:${role}` -> rule. */
export type SideRules = Map<string, SideRule>;

export const sideKey = (category: string, role: MealItemRole) => `${category}:${role}`;

/** Each category's item roles in pick order (pick N = the Nth item by sortOrder). */
export function rolesByCategory(items: { category: string; sortOrder: number; role?: MealItemRole | null }[]): Map<string, MealItemRole[]> {
  const out = new Map<string, MealItemRole[]>();
  for (const it of [...items].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const list = out.get(it.category) ?? [];
    list.push(it.role ?? "main");
    out.set(it.category, list);
  }
  return out;
}

/**
 * Roles after a day's swaps, folded like row diets (rowPlansAfterSwaps): the row given up goes and
 * later rows keep their role. Without this, swapping the 12oz main away made the 8oz side "pick 1",
 * read as a main, and it lost its dal default. A pick a swap brings in is a main.
 */
export function rolesAfterSwaps(roles: Map<string, MealItemRole[]> | null, swaps: SwapRow[]): Map<string, MealItemRole[]> | null {
  if (!roles || swaps.length === 0) return roles;
  const slots = new Map([...roles].map(([category, list]) => [category, list.map((value: MealItemRole | null, row) => ({ row, value }))]));
  const folded = foldSwaps(slots, swaps.map((s) => ({ ...s, receiveTu: null })), { sameUnit: () => false, receiveTu: () => null });
  return new Map([...folded].map(([category, rows]) => [category, rows.map((r) => r.value ?? "main")]));
}

/** The dishes a side pick may take that day besides its own category's: the fixed dish, or the source category's. */
export function sideOptions(rule: SideRule | undefined, dayItems: SideItem[], planDishIds: Set<bigint>): SideItem[] {
  if (!rule) return [];
  if (rule.dish) return [rule.dish];
  return dayItems.filter((i) => i.slot === rule.sourceCategory && planDishIds.has(i.dishId));
}

/**
 * The default dish for a side pick, or undefined to keep the normal default. A source
 * category with nothing servable on that day falls back too, so a side box is never empty.
 */
export function sideDefault(
  rule: SideRule | undefined,
  dayItems: SideItem[],
  planDishIds: Set<bigint>,
): SideItem | undefined {
  const options = sideOptions(rule, dayItems, planDishIds);
  return options.find((i) => i.isDefault) ?? options[0];
}

/** Standing rules, then each day's overrides on top, for one menu week. */
export async function loadSideRules(weekId: bigint): Promise<Map<DayOfWeek | "*", SideRules>> {
  const cat = alias(dishCategories, "side_cat");
  const src = alias(dishCategories, "side_src");
  const [defaults, overrides] = await Promise.all([
    db.select({ category: cat.key, role: menuSideDefaults.role, source: src.key })
      .from(menuSideDefaults)
      .innerJoin(cat, eq(cat.id, menuSideDefaults.categoryId))
      .innerJoin(src, eq(src.id, menuSideDefaults.sourceCategoryId)),
    db.select({
      day: menuDaySides.dayOfWeek, category: cat.key, role: menuDaySides.role, source: src.key,
      dishId: dishes.id, dishName: dishes.name, dishPublicId: dishes.publicId, dishPlanId: dishes.planId,
    })
      .from(menuDaySides)
      .innerJoin(cat, eq(cat.id, menuDaySides.categoryId))
      .leftJoin(src, eq(src.id, menuDaySides.sourceCategoryId))
      .leftJoin(dishes, eq(dishes.id, menuDaySides.dishId))
      .where(eq(menuDaySides.menuWeekId, weekId)),
  ]);
  const standing: SideRules = new Map(defaults.map((d) => [sideKey(d.category, d.role), { sourceCategory: d.source }]));
  const out = new Map<DayOfWeek | "*", SideRules>([["*", standing]]);
  for (const o of overrides) {
    const day = out.get(o.day) ?? new Map(standing);
    const rule: SideRule | null = o.source
      ? { sourceCategory: o.source }
      : o.dishId != null
        ? { dish: { slot: o.category, dishId: o.dishId, isDefault: true, name: o.dishName!, publicId: o.dishPublicId!, planId: o.dishPlanId! } }
        : null;
    if (rule) day.set(sideKey(o.category, o.role), rule);
    out.set(o.day, day);
  }
  return out;
}

export function sideRulesForDay(rules: Map<DayOfWeek | "*", SideRules>, day: DayOfWeek): SideRules {
  return rules.get(day) ?? rules.get("*") ?? new Map();
}
