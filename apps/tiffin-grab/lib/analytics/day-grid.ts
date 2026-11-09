import { addDaysIso, mondayIndex } from "@foundry/commons/util/dates";

/** Mon–Sun weeks, oldest first, from the first to the last row's week; days without a row are null so columns stay aligned. */
export function dayGrid<T extends { date: string }>(rows: T[]): (T | null)[][] {
  if (rows.length === 0) return [];
  const byDate = new Map(rows.map((r) => [r.date, r]));
  const dates = [...byDate.keys()].sort();
  const first = addDaysIso(dates[0]!, -mondayIndex(dates[0]!));
  const last = dates.at(-1)!;
  const weeks: (T | null)[][] = [];
  for (let start = first; start <= last; start = addDaysIso(start, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => byDate.get(addDaysIso(start, i)) ?? null));
  }
  return weeks;
}
