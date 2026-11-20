import { and, gte, lte, type SQL } from "drizzle-orm";
import type { AnyColumn } from "drizzle-orm";
import { getAppSettings } from "@/lib/settings";
import { currentMonthEpochRange } from "@/lib/dates/epoch-window";
import { parseRangeParams, dateQs, rangeParams, type WithUrlDates } from "@/lib/dates/range-params";

type Dated = { from?: string; to?: string; range?: string };

/**
 * Normalises `range=`, ISO and legacy epoch `from`/`to` to the epoch-ms strings every
 * query reads, filling the current business month when none is valid. Also sets `dateQs`
 * (see `WithUrlDates`) so drill links write the readable form; it stays off `T` so search-param records keep their type.
 */
export function fillDefaultMonth<T extends Dated>(sp: T, timezone: string, now = Date.now()): T {
  const parsed = parseRangeParams(sp, timezone, now);
  if (parsed.from == null && parsed.to == null) {
    const month = currentMonthEpochRange(timezone, now);
    return { ...sp, from: String(month.from), to: String(month.to), dateQs: "" } satisfies WithUrlDates as T;
  }
  const dates = parsed.preset ? rangeParams({ preset: parsed.preset }, timezone, now) : rangeParams(parsed, timezone, now, { exact: true });
  return {
    ...sp,
    from: parsed.from == null ? undefined : String(parsed.from),
    to: parsed.to == null ? undefined : String(parsed.to),
    dateQs: dateQs(dates),
  } satisfies WithUrlDates as T;
}

/** `range=`, ISO and epoch `from`/`to` as the epoch strings `parseFilterState` reads; no valid window stays open (all time). */
export function explicitDates<T extends Dated>(sp: T, timezone: string, now = Date.now()): T {
  const p = parseRangeParams(sp, timezone, now);
  return { ...sp, from: p.from == null ? undefined : String(p.from), to: p.to == null ? undefined : String(p.to) };
}

export async function withExplicitDates<T extends Dated>(sp: T): Promise<T> {
  const { timezone } = await getAppSettings();
  return explicitDates(sp, timezone);
}

export async function withDefaultMonth<T extends Dated>(sp: T): Promise<T> {
  const { timezone } = await getAppSettings();
  return fillDefaultMonth(sp, timezone);
}

/**
 * Dates for a searchable list. A text search spans all dates, so a match from
 * before the default month still shows; without one the list keeps its range.
 */
export async function withListDates<T extends Dated & { q?: string }>(sp: T): Promise<T> {
  if (sp.q?.trim()) return { ...sp, from: undefined, to: undefined, dateQs: undefined } satisfies WithUrlDates as T;
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
