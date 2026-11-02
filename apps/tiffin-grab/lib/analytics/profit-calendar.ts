import { calendarWeeks } from "./calendar";
import type { ProfitRow } from "@/lib/analytics/profitability";

/**
 * Mon–Fri weeks (Mon–Sun when any weekend day had deliveries) holding only days with deliveries;
 * the rest are null so columns stay aligned. Weeks with nothing to show are dropped.
 */
export function profitCalendar(rows: ProfitRow[], from: string, to: string): { columns: 5 | 7; weeks: (ProfitRow | null)[][] } {
  const byDate = new Map(rows.filter((r) => r.tiffins > 0).map((r) => [r.date, r]));
  const all = calendarWeeks(from, to);
  const columns = all.some((w) => w.slice(5).some((d) => d && byDate.has(d))) ? 7 : 5;
  const weeks = all
    .map((w) => w.slice(0, columns).map((d) => (d ? (byDate.get(d) ?? null) : null)))
    .filter((w) => w.some(Boolean));
  return { columns, weeks };
}
