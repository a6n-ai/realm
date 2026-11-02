type Row = Record<string, string | number>;
type Series = { key: string; label: string };

/**
 * Series names come from the DB (plan names). They must never become CSS variable
 * names (shadcn writes config keys into a <style> tag) or Recharts dataKeys (a dot
 * is read as a path), so charts key series by position and keep the name as a label.
 */
export const seriesKey = (i: number) => `s${i}`;

export function keySeries(data: Row[], series: Series[]) {
  const rows = data.map((row) => ({
    ...row,
    ...Object.fromEntries(series.map((s, i) => [seriesKey(i), row[s.key]])),
  }));
  return { rows, keys: series.map((_, i) => seriesKey(i)) };
}
