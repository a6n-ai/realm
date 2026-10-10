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

/** Inclusive epoch window. Either end may be open. */
export function epochBoundsWhere(col: AnyColumn, sp: Dated): SQL | undefined {
  const n = (v?: string) => (v && Number.isFinite(Number(v)) ? Number(v) : undefined);
  const a = n(sp.from);
  const b = n(sp.to);
  if (a != null && b != null) return and(gte(col, Math.min(a, b)), lte(col, Math.max(a, b)));
  if (a != null) return gte(col, a);
  if (b != null) return lte(col, b);
  return undefined;
}
