/**
 * Client-safe analytics filter param names + parsers. Kept free of db/drizzle
 * so client components (tabs) can import without pulling postgres into the
 * browser bundle.
 */

import { zonedRangeMs } from "@/lib/analytics/drill";
import { currentMonth, monthBounds } from "@/lib/analytics/profitability";

export const ANALYTICS_FILTER_PARAMS = ["from", "to", "plan", "mealSize", "zone"] as const;

export type AnalyticsSearchParams = Partial<Record<(typeof ANALYTICS_FILTER_PARAMS)[number], string>>;

export type AnalyticsFilters = {
  /** Inclusive range start, epoch ms (DateRangePicker). */
  from?: number;
  /** Inclusive range end, epoch ms. */
  to?: number;
  /** Plan keys. */
  plans: string[];
  /** Meal size keys. */
  mealSizes: string[];
  /** Delivery zone names. */
  zones: string[];
};

const list = (raw: string | undefined): string[] =>
  (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const epoch = (raw: string | undefined): number | undefined => {
  if (!raw) return undefined;
  // Facet dateRange writes epoch ms; revenue once wrote ISO dates — accept both.
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const n = Date.parse(`${raw}T00:00:00.000Z`);
    return Number.isFinite(n) ? n : undefined;
  }
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
};

/** Inclusive epoch window for the calendar month containing `now` in `timezone`. */
export function currentMonthEpochRange(timezone: string, now = Date.now()): { from: number; to: number } {
  const bounds = monthBounds(currentMonth(timezone, now));
  return zonedRangeMs(bounds.from, bounds.to, timezone);
}

export function parseAnalyticsFilters(
  sp: AnalyticsSearchParams,
  opts?: { timezone?: string; now?: number },
): AnalyticsFilters {
  let from = epoch(sp.from);
  let to = epoch(sp.to);
  // Analytics always scopes to a date range; missing params mean the current month.
  if (from == null && to == null && opts?.timezone) {
    const range = currentMonthEpochRange(opts.timezone, opts.now);
    from = range.from;
    to = range.to;
  }
  return {
    from,
    to,
    plans: list(sp.plan),
    mealSizes: list(sp.mealSize),
    zones: list(sp.zone),
  };
}

export function hasDimensionFilters(f: AnalyticsFilters): boolean {
  return f.plans.length > 0 || f.mealSizes.length > 0 || f.zones.length > 0;
}

export function hasDateFilter(f: AnalyticsFilters): boolean {
  return f.from != null || f.to != null;
}

export type AnalyticsFilterOptions = {
  plans: { value: string; label: string }[];
  mealSizes: { value: string; label: string; parent: string }[];
  zones: { value: string; label: string }[];
};
