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
  return [...byName.values()].filter((r) => r.total > 0 || r.prevTotal > 0).sort((a, b) => b.total - a.total || a.mealSize.localeCompare(b.mealSize));
}
