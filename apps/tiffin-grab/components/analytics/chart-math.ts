export type Tone = "success" | "warning" | "destructive" | "muted" | "chart";
export type Part = { label: string; value: number; tone?: Tone; href?: string };
export type SharedPart = Part & { share: number; color: string };

export const TONE_COLOR: Record<Exclude<Tone, "chart">, string> = {
  success: "var(--success)",
  warning: "var(--warning)",
  destructive: "var(--destructive)",
  muted: "var(--muted-foreground)",
};

export const chartColor = (i: number) => `var(--chart-${(i % 5) + 1})`;

// --chart-4 is red; beside status colours it would read as status, so mixed charts skip it.
const CATEGORICAL = [1, 2, 3, 4, 5];
const CATEGORICAL_WITH_STATUS = [1, 2, 3, 5];

/** Largest-remainder rounding so whole-number shares always add to exactly 100. */
function shares(values: number[]): number[] {
  const total = values.reduce((a, b) => a + b, 0);
  if (total <= 0) return values.map(() => 0);
  const raw = values.map((v) => (v / total) * 100);
  const out = raw.map(Math.floor);
  let left = 100 - out.reduce((a, b) => a + b, 0);
  raw
    .map((r, i) => [r - Math.floor(r), i] as const)
    .sort((a, b) => b[0] - a[0])
    .forEach(([, i]) => {
      if (left-- > 0) out[i]! += 1;
    });
  return out;
}

/** Keeps the largest `max - 1` parts when there are more than `max`, folds the rest into "Other". */
export function foldParts(input: Part[], max = 5): SharedPart[] {
  const parts = input.filter((p) => p.value > 0);
  let kept = parts;
  if (parts.length > max) {
    const sorted = [...parts].sort((a, b) => b.value - a.value);
    const head = sorted.slice(0, max - 1);
    const rest = sorted.slice(max - 1);
    kept = [
      ...parts.filter((p) => head.includes(p)),
      { label: "Other", value: rest.reduce((s, p) => s + p.value, 0), tone: "muted" },
    ];
  }
  const pct = shares(kept.map((p) => p.value));
  const isStatus = (p: Part) => !!p.tone && p.tone !== "chart";
  const palette = kept.some((p) => isStatus(p) && p.tone !== "muted") ? CATEGORICAL_WITH_STATUS : CATEGORICAL;
  let cat = 0;
  return kept.map((p, i) => ({
    ...p,
    share: pct[i]!,
    color: isStatus(p) ? TONE_COLOR[p.tone as keyof typeof TONE_COLOR] : `var(--chart-${palette[cat++ % palette.length]})`,
  }));
}

export type FunnelStage = { label: string; value: number; kept: number | null; width: number };

/** Stages stay in the order given. `kept` is the % of the previous stage; width is relative to the first. */
export function funnelStages(input: { label: string; value: number }[]): FunnelStage[] {
  const base = input[0]?.value ?? 0;
  return input.map((s, i) => {
    const prev = input[i - 1]?.value;
    return {
      ...s,
      kept: i === 0 || !prev ? null : Math.round((s.value / prev) * 100),
      width: base > 0 ? Math.max(0, Math.min(100, (s.value / base) * 100)) : 0,
    };
  });
}

export const HEAT_STEPS = 5;

/** 0 for an empty cell, else 1..steps by position between min and max. */
export function heatBucket(value: number | null | undefined, min: number, max: number, steps = HEAT_STEPS): number {
  if (value == null || value <= 0) return 0;
  if (max <= min) return steps;
  return Math.min(steps, Math.max(1, Math.ceil(((value - min) / (max - min)) * steps) || 1));
}

/** Whether a cell is dark enough that its text must flip to the background token. */
export const heatIsDense = (bucket: number) => bucket >= 4;

/** Opacity of the one-hue ramp for a bucket. */
export const heatOpacity = (bucket: number, steps = HEAT_STEPS) => (bucket === 0 ? 0 : 0.15 + (0.85 * bucket) / steps);

/** Top `limit` rows by value (a lone leftover row is shown, not folded), the tail summed into "Other". Order is value-descending. */
export function topWithOther<T extends Record<string, string | number>>(
  rows: T[],
  labelKey: string,
  valueKey: string,
  limit = 8,
): Record<string, string | number>[] {
  const sorted = [...rows].sort((a, b) => Number(b[valueKey]) - Number(a[valueKey]));
  if (rows.length <= limit + 1) return sorted;
  const rest = sorted.slice(limit);
  return [
    ...sorted.slice(0, limit),
    { [labelKey]: "Other", [valueKey]: rest.reduce((s, r) => s + Number(r[valueKey]), 0) },
  ];
}

export const ROW_HEIGHT = 36;
export const rankedHeight = (rows: number) => Math.max(3, rows) * ROW_HEIGHT;

/** Series are keyed by position; the name is only ever a label. */
export function positionalConfig(series: { label: string }[]) {
  return Object.fromEntries(series.map((s, i) => [`s${i}`, { label: s.label, color: chartColor(i) }]));
}

const STEPS = [1, 2, 5, 10];

/** Smallest 1/2/5 x 10^k step that covers [0, max] in at most `intervals` intervals. */
function axisStep(max: number, intervals: number): number {
  if (!(max > 0)) return 1;
  const mag = 10 ** Math.floor(Math.log10(max / intervals));
  return (STEPS.map((m) => m * mag).find((s) => Math.ceil(max / s) <= intervals) ?? 10 * mag);
}

/** Axis ticks from 0 to a rounded-up max, about five of them. Counts get whole numbers only. */
export function axisTicks(max: number, integer = false, intervals = 5): number[] {
  let step = axisStep(max, intervals);
  if (integer) step = Math.max(1, Math.ceil(step));
  const top = Math.max(1, Math.ceil(max / step)) * step;
  return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
}

/** "$0", "$500", "$1k", "$1.5k". The decimal only ever appears on the small (under $3k) scales. */
export function moneyTick(v: number): string {
  const a = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (a < 1000) return `${sign}$${Math.round(a)}`;
  return `${sign}$${Number((a / 1000).toFixed(1))}k`;
}

/** Recharts `interval` that leaves roughly every 4th day labelled on a 30-day chart. */
export const tickEvery = (points: number) => Math.max(0, Math.ceil(points / 8) - 1);

/** Ranked-bar labels: ~18 characters, the tooltip keeps the full name. */
export function truncateLabel(v: unknown, max = 18): string {
  const s = String(v ?? "");
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** Ticks for a chart that can go negative: nice min and max on one step, always including 0. */
export function signedTicks(min: number, max: number): number[] {
  const step = axisStep(Math.max(max, -min, 1) * 2, 6) / 1;
  const lo = Math.floor(Math.min(min, 0) / step) * step;
  const hi = Math.ceil(Math.max(max, 0) / step) * step;
  return Array.from({ length: Math.round((hi - lo) / step) + 1 }, (_, i) => lo + i * step);
}
