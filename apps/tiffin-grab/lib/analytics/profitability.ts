/**
 * Daily profitability math. Cash (payments captured that day) is deliberately
 * a different number from revenue (plan total allocated onto delivered tiffins).
 * A 20-tiffin plan paid in January and delivered across January+February earns
 * half its value in each month — even though January's cash is the full amount.
 */

export type ProfitabilityAssumptions = {
  kitchenCostPerTiffin: number;
  driverCostPerTiffin: number;
  otherCostPerTiffin: number;
  marketingMonthly: number;
  salaryMonthly: number;
  otherMonthly: number;
};

export const ZERO_ASSUMPTIONS: ProfitabilityAssumptions = {
  kitchenCostPerTiffin: 0,
  driverCostPerTiffin: 0,
  otherCostPerTiffin: 0,
  marketingMonthly: 0,
  salaryMonthly: 0,
  otherMonthly: 0,
};

const KEYS = Object.keys(ZERO_ASSUMPTIONS) as (keyof ProfitabilityAssumptions)[];

function asNonNeg(n: unknown): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v) || v < 0) return 0;
  return v;
}

export function parseAssumptions(raw: unknown): ProfitabilityAssumptions {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out = { ...ZERO_ASSUMPTIONS };
  for (const k of KEYS) out[k] = asNonNeg(src[k]);
  return out;
}

export type Grain = "daily" | "weekly" | "monthly";

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Calendar days in a 1-indexed month. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function eachDateInclusive(fromIso: string, toIso: string): string[] {
  const out: string[] = [];
  const d = new Date(`${fromIso}T00:00:00Z`);
  const end = new Date(`${toIso}T00:00:00Z`);
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export function addMonths(monthIso: string, delta: number): string {
  const [y, m] = monthIso.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function currentMonth(timeZone: string, now = Date.now()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit" }).format(now);
}

/** Calendar date of an instant in `timeZone` as YYYY-MM-DD. */
export function isoDateInZone(epochMs: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(epochMs);
}

export function monthBounds(monthIso: string): { from: string; to: string } {
  const [y, m] = monthIso.split("-").map(Number) as [number, number];
  const last = daysInMonth(y, m);
  return {
    from: `${monthIso}-01`,
    to: `${monthIso}-${String(last).padStart(2, "0")}`,
  };
}

/** Monday of the ISO week containing `isoDate` (UTC date-only). */
export function isoWeekMonday(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return d.toISOString().slice(0, 10);
}

export function periodKey(isoDate: string, grain: Grain): string {
  switch (grain) {
    case "daily":
      return isoDate;
    case "weekly":
      return isoWeekMonday(isoDate);
    case "monthly":
      return isoDate.slice(0, 7);
    default: {
      const _exhaustive: never = grain;
      return _exhaustive;
    }
  }
}

const MONTH_LABEL = new Intl.DateTimeFormat("en-CA", { month: "short", year: "numeric", timeZone: "UTC" });
const DAY_LABEL = new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", timeZone: "UTC" });

export function periodLabel(key: string, grain: Grain): string {
  switch (grain) {
    case "daily":
      return DAY_LABEL.format(new Date(`${key}T00:00:00Z`));
    case "weekly": {
      const start = new Date(`${key}T00:00:00Z`);
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 6);
      return `${DAY_LABEL.format(start)} – ${DAY_LABEL.format(end)}`;
    }
    case "monthly":
      return MONTH_LABEL.format(new Date(`${key}-01T00:00:00Z`));
    default: {
      const _exhaustive: never = grain;
      return _exhaustive;
    }
  }
}

export type DailyFacts = {
  date: string;
  tiffins: number;
  revenue: number;
  cashCollected: number;
};

export type ProfitRow = DailyFacts & {
  kitchen: number;
  driver: number;
  marketing: number;
  salaries: number;
  other: number;
  costs: number;
  profit: number;
  marginPct: number | null;
};

function allocatedForDate(assumptions: ProfitabilityAssumptions, isoDate: string) {
  const y = Number(isoDate.slice(0, 4));
  const m = Number(isoDate.slice(5, 7));
  const days = daysInMonth(y, m);
  return {
    marketing: assumptions.marketingMonthly / days,
    salaries: assumptions.salaryMonthly / days,
    otherMonthly: assumptions.otherMonthly / days,
  };
}

export function decorateDay(facts: DailyFacts, assumptions: ProfitabilityAssumptions): ProfitRow {
  const allocated = allocatedForDate(assumptions, facts.date);
  const kitchen = facts.tiffins * assumptions.kitchenCostPerTiffin;
  const driver = facts.tiffins * assumptions.driverCostPerTiffin;
  const other = allocated.otherMonthly + facts.tiffins * assumptions.otherCostPerTiffin;
  const costs = kitchen + driver + allocated.marketing + allocated.salaries + other;
  const profit = facts.revenue - costs;
  const marginPct = facts.revenue > 0 ? round2((profit / facts.revenue) * 100) : null;
  return {
    date: facts.date,
    tiffins: facts.tiffins,
    revenue: round2(facts.revenue),
    cashCollected: round2(facts.cashCollected),
    kitchen: round2(kitchen),
    driver: round2(driver),
    marketing: round2(allocated.marketing),
    salaries: round2(allocated.salaries),
    other: round2(other),
    costs: round2(costs),
    profit: round2(profit),
    marginPct,
  };
}

export function rollup(rows: ProfitRow[], grain: Grain): ProfitRow[] {
  if (grain === "daily") return rows;
  const buckets = new Map<string, ProfitRow[]>();
  for (const r of rows) {
    const k = periodKey(r.date, grain);
    const list = buckets.get(k) ?? [];
    list.push(r);
    buckets.set(k, list);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, group]) => sumRows(key, group));
}

function sumRows(date: string, group: ProfitRow[]): ProfitRow {
  const tiffins = group.reduce((s, r) => s + r.tiffins, 0);
  const revenue = round2(group.reduce((s, r) => s + r.revenue, 0));
  const cashCollected = round2(group.reduce((s, r) => s + r.cashCollected, 0));
  const kitchen = round2(group.reduce((s, r) => s + r.kitchen, 0));
  const driver = round2(group.reduce((s, r) => s + r.driver, 0));
  const marketing = round2(group.reduce((s, r) => s + r.marketing, 0));
  const salaries = round2(group.reduce((s, r) => s + r.salaries, 0));
  const other = round2(group.reduce((s, r) => s + r.other, 0));
  const costs = round2(kitchen + driver + marketing + salaries + other);
  const profit = round2(revenue - costs);
  return {
    date,
    tiffins,
    revenue,
    cashCollected,
    kitchen,
    driver,
    marketing,
    salaries,
    other,
    costs,
    profit,
    marginPct: revenue > 0 ? round2((profit / revenue) * 100) : null,
  };
}

export type ProfitabilityKpis = {
  cashCollected: number;
  revenue: number;
  costs: number;
  profit: number;
  marginPct: number | null;
  profitPerTiffin: number | null;
  tiffins: number;
};

export function kpis(rows: ProfitRow[]): ProfitabilityKpis {
  const tiffins = rows.reduce((s, r) => s + r.tiffins, 0);
  const cashCollected = round2(rows.reduce((s, r) => s + r.cashCollected, 0));
  const revenue = round2(rows.reduce((s, r) => s + r.revenue, 0));
  const costs = round2(rows.reduce((s, r) => s + r.costs, 0));
  const profit = round2(revenue - costs);
  return {
    cashCollected,
    revenue,
    costs,
    profit,
    marginPct: revenue > 0 ? round2((profit / revenue) * 100) : null,
    profitPerTiffin: tiffins > 0 ? round2(profit / tiffins) : null,
    tiffins,
  };
}
