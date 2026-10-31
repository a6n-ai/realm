import { and, gte, lte, type SQL } from "drizzle-orm";
import type { AnyColumn } from "drizzle-orm";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { currentMonthEpochRange } from "@/lib/services/analytics/shared-filter-params";

type Dated = { from?: string; to?: string };

function hasBound(sp: Dated): boolean {
  return (sp.from != null && sp.from !== "") || (sp.to != null && sp.to !== "");
}

/** Fill a missing `from`/`to` with the current business month. Explicit bounds stay. */
export function fillDefaultMonth<T extends Dated>(sp: T, timezone: string, now = Date.now()): T {
  if (hasBound(sp)) return sp;
  const range = currentMonthEpochRange(timezone, now);
  return { ...sp, from: String(range.from), to: String(range.to) };
}

export async function withDefaultMonth<T extends Dated>(sp: T): Promise<T> {
  if (hasBound(sp)) return sp;
  const { timezone } = await getAppSettings();
  return fillDefaultMonth(sp, timezone);
}

/**
 * Dates for a searchable list. A text search spans all dates, so a match from
 * before the default month still shows; without one the list keeps its range.
 */
export async function withListDates<T extends Dated & { q?: string }>(sp: T): Promise<T> {
  if (sp.q?.trim()) return { ...sp, from: undefined, to: undefined };
  return withDefaultMonth(sp);
}

function bounds(sp: Dated, ge: (v: number) => SQL, le: (v: number) => SQL): SQL | undefined {
  const n = (v?: string) => (v && Number.isFinite(Number(v)) ? Number(v) : undefined);
  const a = n(sp.from);
  const b = n(sp.to);
  if (a != null && b != null) return and(ge(Math.min(a, b)), le(Math.max(a, b)));
  if (a != null) return ge(a);
  if (b != null) return le(b);
  return undefined;
}

/** Inclusive epoch window. Either end may be open. */
export function epochBoundsWhere(col: AnyColumn, sp: Dated): SQL | undefined {
  return bounds(sp, (v) => gte(col, v), (v) => lte(col, v));
}

/** Same window over an epoch-ms SQL expression, such as a coalesce of two columns. */
export function epochBoundsWhereSql(expr: SQL, sp: Dated): SQL | undefined {
  return bounds(sp, (v) => gte(expr, v), (v) => lte(expr, v));
}

/** Numeric window for stat functions. A missing end opens to the epoch start or now. */
export function epochRange(sp: Dated): { from: number; to: number } {
  const n = (v?: string) => (v && Number.isFinite(Number(v)) ? Number(v) : undefined);
  const a = n(sp.from) ?? 0;
  const b = n(sp.to) ?? Date.now();
  return { from: Math.min(a, b), to: Math.max(a, b) };
}
