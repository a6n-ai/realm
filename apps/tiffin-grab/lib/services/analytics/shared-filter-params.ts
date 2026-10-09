/**
 * Client-safe analytics filter param names + parsers. Kept free of db/drizzle
 * so client components (tabs) can import without pulling postgres into the
 * browser bundle.
 */

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

export function parseAnalyticsFilters(sp: AnalyticsSearchParams): AnalyticsFilters {
  return {
    from: epoch(sp.from),
    to: epoch(sp.to),
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
