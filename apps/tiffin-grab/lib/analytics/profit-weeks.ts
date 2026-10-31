import { mondayIndex } from "./calendar";
import { round2, type ProfitRow } from "./profitability";

export type ProfitWeek = { start: string; end: string; row: ProfitRow };

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const SUMMED = ["tiffins", "revenue", "cashCollected", "unpaidRevenue", "kitchen", "driver", "marketing", "salaries", "other", "costs", "profit"] as const;

/** Mon–Sun weeks, oldest first; every figure is the plain sum of its day cards, margin recomputed from the sums. */
export function groupProfitWeeks(rows: ProfitRow[]): ProfitWeek[] {
  const weeks = new Map<string, ProfitWeek>();
  for (const r of [...rows].sort((a, b) => a.date.localeCompare(b.date))) {
    const start = addDays(r.date, -mondayIndex(r.date));
    let w = weeks.get(start);
    if (!w) {
      const row = { date: start, marginPct: null } as ProfitRow;
      for (const k of SUMMED) row[k] = 0;
      w = { start, end: addDays(start, 6), row };
      weeks.set(start, w);
    }
    for (const k of SUMMED) w.row[k] += r[k];
  }
  return [...weeks.values()].map((w) => {
    for (const k of SUMMED) w.row[k] = round2(w.row[k]);
    w.row.marginPct = w.row.revenue > 0 ? round2((w.row.profit / w.row.revenue) * 100) : null;
    return w;
  });
}
