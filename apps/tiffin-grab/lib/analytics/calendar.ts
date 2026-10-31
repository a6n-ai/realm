/** Monday = 0 … Sunday = 6 for a YYYY-MM-DD calendar day. */
export function mondayIndex(iso: string): number {
  return (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;
}

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * Mon–Sun rows covering `from`..`to` (inclusive calendar days, already in the app timezone).
 * Days outside the range are null, so a month starting on a Thursday has blank Mon–Wed cells.
 */
export function calendarWeeks(from: string, to: string): (string | null)[][] {
  if (from > to) return [];
  const weeks: (string | null)[][] = [];
  let cursor = addDays(from, -mondayIndex(from));
  while (cursor <= to) {
    weeks.push(Array.from({ length: 7 }, (_, i) => {
      const day = addDays(cursor, i);
      return day >= from && day <= to ? day : null;
    }));
    cursor = addDays(cursor, 7);
  }
  return weeks;
}
