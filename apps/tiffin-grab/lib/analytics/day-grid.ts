import { mondayIndex } from "./calendar";

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Mon–Sun weeks, oldest first, from the first to the last row's week; days without a row are null so columns stay aligned. */
export function dayGrid<T extends { date: string }>(rows: T[]): (T | null)[][] {
  if (rows.length === 0) return [];
  const byDate = new Map(rows.map((r) => [r.date, r]));
  const dates = [...byDate.keys()].sort();
  const first = addDays(dates[0]!, -mondayIndex(dates[0]!));
  const last = dates.at(-1)!;
  const weeks: (T | null)[][] = [];
  for (let start = first; start <= last; start = addDays(start, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => byDate.get(addDays(start, i)) ?? null));
  }
  return weeks;
}
