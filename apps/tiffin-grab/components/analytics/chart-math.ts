export type Tone = "success" | "warning" | "destructive" | "muted" | "chart";
export type Part = { label: string; value: number; tone?: Tone };
export type SharedPart = Part & { share: number; color: string };

const TONE_COLOR: Record<Exclude<Tone, "chart">, string> = {
  success: "var(--success)",
  warning: "var(--warning)",
  destructive: "var(--destructive)",
  muted: "var(--muted-foreground)",
};

export const chartColor = (i: number) => `var(--chart-${(i % 5) + 1})`;

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
export function foldParts(input: Part[], max = 6): SharedPart[] {
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
  let cat = 0;
  return kept.map((p, i) => ({
    ...p,
    share: pct[i]!,
    color: p.tone && p.tone !== "chart" ? TONE_COLOR[p.tone] : chartColor(cat++),
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

/** Opacity of the one-hue ramp for a bucket. */
export const heatOpacity = (bucket: number, steps = HEAT_STEPS) => (bucket === 0 ? 0 : 0.15 + (0.85 * bucket) / steps);

/** Top `limit` rows by value, the tail summed into "Other". Order is value-descending. */
export function topWithOther<T extends Record<string, string | number>>(
  rows: T[],
  labelKey: string,
  valueKey: string,
  limit = 8,
): Record<string, string | number>[] {
  if (rows.length <= limit) return rows;
  const sorted = [...rows].sort((a, b) => Number(b[valueKey]) - Number(a[valueKey]));
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
