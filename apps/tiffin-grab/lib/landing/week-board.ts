import { parseIsoDateUtc } from "@foundry/commons";
import type { BoardDay } from "@/components/landing/week-board";
import { formatDateOnly } from "@/lib/format/datetime";
import type { MealSlot } from "@/lib/menu/meal-types";
import { buildPosterColumns, DAYS, DAY_COLUMNS, type PosterItem } from "@/lib/menu/poster";
import { nonVegDishes, popularByDiet } from "@/lib/menu/customer-week";

const isoOf = (weekStart: string, offset: number) => {
  const d = parseIsoDateUtc(weekStart);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};
export const dateOf = (weekStart: string, offset: number) => formatDateOnly(isoOf(weekStart, offset), { mode: "short" });

// Each dish is listed once per plan; the plan suffix only doubles the list.
const plain = (name: string) => name.replace(/\s*\((?:Non-Veg|Veg)\)$/i, "");

export type BoardWeekend = { date: string; today: boolean; dishes: string[] };

/** The released week as Mon to Fri board columns with their dish-type rows; Sat and Sun come apart as one weekend line.
 *  `picks` (plain dish name to pick count, see foldPicks) marks each row's Popular veg and non-veg dish per day. */
export function buildWeekBoard(pub: { weekStart: string; slots: MealSlot[]; items: PosterItem[] }, timezone: string, picks: Record<string, number> = {}): { days: BoardDay[]; rows: string[]; weekend: BoardWeekend | null } {
  const todayIso = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
  const rows: string[] = [];
  const nonVeg = nonVegDishes(pub.items);
  let weekend: BoardWeekend | null = null;
  const days = buildPosterColumns(pub.slots, pub.items).flatMap((col, i): BoardDay[] => {
    const keys = DAY_COLUMNS[i]!.days;
    const today = keys.map((k) => isoOf(pub.weekStart, DAYS.indexOf(k))).includes(todayIso);
    if (keys.length > 1) {
      const all = [...new Set(col.groups.flatMap((g) => g.dishes.map((d) => plain(d.name))))];
      if (all.length > 0) weekend = { date: `${dateOf(pub.weekStart, 5)} and ${dateOf(pub.weekStart, 6)}`, today, dishes: all };
      return [];
    }
    const dishes: Record<string, string[]> = {};
    const popular: string[] = [];
    for (const g of col.groups) {
      const names = [...new Set(g.dishes.map((d) => plain(d.name)))];
      if (names.length === 0) continue;
      const row = g.slotLabel ?? "Dishes";
      if (!rows.includes(row)) rows.push(row);
      dishes[row] = names;
      popular.push(...popularByDiet(names, picks, nonVeg));
    }
    if (Object.keys(dishes).length === 0) return [];
    return [{ key: col.label, label: col.label, short: col.label.slice(0, 3), date: dateOf(pub.weekStart, DAYS.indexOf(keys[0]!)), today, dishes, popular }];
  });
  return { days, rows, weekend };
}
