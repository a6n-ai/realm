/**
 * Client-safe analytics filter param names + parsers. Kept free of db/drizzle
 * so client components (tabs) can import without pulling postgres into the
 * browser bundle.
 */

import { zonedRangeMs } from "@/lib/analytics/drill";
import { currentMonth, monthBounds } from "@/lib/analytics/profitability";
import { isoToUtcDate } from "@foundry/commons/util/dates";

export const ANALYTICS_FILTER_PARAMS = ["from", "to", "plan", "mealSize", "zone", "org"] as const;

export type AnalyticsSearchParams = Partial<Record<(typeof ANALYTICS_FILTER_PARAMS)[number], string>>;

export const list = (raw: string | undefined): string[] =>
  (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

export const epoch = (raw: string | undefined): number | undefined => {
  if (!raw) return undefined;
  // Facet dateRange writes epoch ms; revenue once wrote ISO dates — accept both.
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const n = isoToUtcDate(raw).getTime();
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

export type AnalyticsFilterOptions = {
  plans: { value: string; label: string }[];
  mealSizes: { value: string; label: string; parent: string }[];
  zones: { value: string; label: string }[];
  orgs: { value: string; label: string }[];
  /** Ticket category / sub-category pairs that have rows in the visible orgs (complaints facets). */
  tickets: { category: string; subcategory?: string }[];
};

/** Carries every analytics filter param (including org) onto another analytics path. */
export function analyticsHref(path: string, sp: Partial<Record<string, string>>): string {
  const qs = new URLSearchParams();
  for (const key of ANALYTICS_FILTER_PARAMS) {
    const v = sp[key];
    if (v) qs.set(key, v);
  }
  const s = qs.toString();
  return s ? `${path}?${s}` : path;
}
