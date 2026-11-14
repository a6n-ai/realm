/**
 * Client-safe analytics filter param names + parsers. Kept free of db/drizzle
 * so client components (tabs) can import without pulling postgres into the
 * browser bundle.
 */

export const ANALYTICS_FILTER_PARAMS = ["from", "to", "plan", "mealSize", "zone", "org"] as const;

export type AnalyticsSearchParams = Partial<Record<(typeof ANALYTICS_FILTER_PARAMS)[number], string>>;

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
