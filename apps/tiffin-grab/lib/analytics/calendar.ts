import { addDaysIso, mondayOfIso } from "@foundry/commons/util/dates";
/**
 * Mon–Sun rows covering `from`..`to` (inclusive calendar days, already in the app timezone).
 * Days outside the range are null, so a month starting on a Thursday has blank Mon–Wed cells.
 */
export function calendarWeeks(from: string, to: string): (string | null)[][] {
  if (from > to) return [];
  const weeks: (string | null)[][] = [];
  let cursor = mondayOfIso(from);
  while (cursor <= to) {
    weeks.push(Array.from({ length: 7 }, (_, i) => {
      const day = addDaysIso(cursor, i);
      return day >= from && day <= to ? day : null;
    }));
    cursor = addDaysIso(cursor, 7);
  }
  return weeks;
}
