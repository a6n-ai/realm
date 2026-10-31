export const KITCHEN_WEEK_ROWS = 8;

export type WeekCell = { mealSize: string; date: string; units: number };
export type KitchenWeekRow = { mealSize: string; days: number[]; total: number; prevTotal: number };

/** Rows per meal size for Mon-Sun from `monday`; `prevTotal` is the 7 days before. Sorted by total, desc. */
export function buildKitchenWeek(cells: WeekCell[], monday: string, addDays: (iso: string, n: number) => string): KitchenWeekRow[] {
  const dates = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const prevFrom = addDays(monday, -7);
  const byName = new Map<string, KitchenWeekRow>();
  for (const c of cells) {
    const row = byName.get(c.mealSize) ?? { mealSize: c.mealSize, days: Array(7).fill(0), total: 0, prevTotal: 0 };
    const i = dates.indexOf(c.date);
    if (i >= 0) {
      row.days[i]! += c.units;
      row.total += c.units;
    } else if (c.date >= prevFrom && c.date < monday) row.prevTotal += c.units;
    byName.set(c.mealSize, row);
  }
  const sorted = [...byName.values()].filter((r) => r.total > 0 || r.prevTotal > 0).sort((a, b) => b.total - a.total || a.mealSize.localeCompare(b.mealSize));
  if (sorted.length <= KITCHEN_WEEK_ROWS + 1) return sorted;
  // Keep the grid short: the biggest sizes, then one "Other" row summing the rest.
  const rest = sorted.slice(KITCHEN_WEEK_ROWS);
  const other: KitchenWeekRow = {
    mealSize: `Other (${rest.length} sizes)`,
    days: Array.from({ length: 7 }, (_, i) => rest.reduce((s, r) => s + r.days[i]!, 0)),
    total: rest.reduce((s, r) => s + r.total, 0),
    prevTotal: rest.reduce((s, r) => s + r.prevTotal, 0),
  };
  return [...sorted.slice(0, KITCHEN_WEEK_ROWS), other];
}
