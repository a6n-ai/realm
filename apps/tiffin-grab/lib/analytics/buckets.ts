import { eachDateInclusive, periodKey, periodLabel, type Grain } from "./profitability";
import { grainForRange } from "./revenue";

const TIP_DAY = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const TICK_DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** `period` is the x tick ("Oct 3", week start "Oct 6", month "Oct 2026"); `tip` is the tooltip heading. */
export function chartPeriod(key: string, grain: Grain): { period: string; tip: string } {
  const at = new Date(`${key}T00:00:00Z`);
  switch (grain) {
    case "daily":
      return { period: TICK_DAY.format(at), tip: TIP_DAY.format(at) };
    case "weekly":
      return { period: TICK_DAY.format(at), tip: `Week of ${TIP_DAY.format(at)}` };
    case "monthly":
      return { period: periodLabel(key, grain), tip: periodLabel(key, grain) };
  }
}

/** Sums per-day counts into the range's grain; days with no rows are zero, never gaps. */
export function bucketCounts<K extends string>(
  rows: ({ iso: string } & Record<K, number>)[],
  keys: readonly K[],
  from: string,
  to: string,
): ({ period: string; tip: string } & Record<K, number>)[] {
  const grain = grainForRange(from, to);
  const zero = () => Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;
  const buckets = new Map<string, Record<K, number>>();
  for (const day of eachDateInclusive(from, to)) buckets.set(periodKey(day, grain), zero());
  for (const r of rows) {
    const b = buckets.get(periodKey(r.iso, grain));
    if (b) for (const k of keys) b[k] += r[k];
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, b]) => ({ ...chartPeriod(key, grain), ...b }));
}
