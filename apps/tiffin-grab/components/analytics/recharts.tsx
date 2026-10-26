"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipContentProps } from "recharts/types/component/Tooltip";

// Cycles the app's five theme-aware chart tokens (light/dark handled by the
// CSS vars themselves — see --chart-1..5 in globals.css).
const CHART_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

// A string, not a formatter function: these charts are rendered from server
// components, and functions cannot cross that boundary as props.
type ValueFormat = "number" | "currency";

const CURRENCY = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" });

function formatValue(v: unknown, format: ValueFormat): string {
  if (format === "currency" && typeof v === "number") return CURRENCY.format(v);
  return String(v);
}

function ChartTooltip({
  active,
  payload,
  label,
  format = "number",
}: TooltipContentProps & { format?: ValueFormat }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover text-popover-foreground rounded-md border px-3 py-2 text-xs shadow-md">
      {label != null && <div className="text-muted-foreground mb-1 font-medium">{label}</div>}
      {payload.map((p) => (
        <div key={`${p.dataKey}`} className="flex items-center gap-2">
          <span className="size-2 rounded-full" style={{ background: p.color }} />
          <span>{p.name}</span>
          <span className="ml-auto font-medium tabular-nums">{formatValue(p.value, format)}</span>
        </div>
      ))}
    </div>
  );
}

function EmptyChart({ height }: { height: number }) {
  return (
    <div className="text-muted-foreground flex items-center justify-center text-sm" style={{ height }}>
      No data yet.
    </div>
  );
}

type Row = Record<string, string | number>;

export function TrendLineChart({
  data,
  xKey,
  yKey,
  series,
  format = "number",
  height = 240,
}: {
  data: Row[];
  xKey: string;
  yKey?: string;
  /** Several named lines; takes precedence over `yKey`. */
  series?: { key: string; label: string }[];
  format?: ValueFormat;
  height?: number;
}) {
  if (data.length === 0) return <EmptyChart height={height} />;
  const lines = series ?? (yKey ? [{ key: yKey, label: yKey }] : []);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
        <XAxis
          dataKey={xKey}
          tick={{ fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          className="fill-muted-foreground"
        />
        <YAxis
          tick={{ fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          width={format === "currency" ? 56 : 36}
          allowDecimals={false}
          className="fill-muted-foreground"
        />
        <Tooltip content={(props) => <ChartTooltip {...props} format={format} />} />
        {lines.map((l, i) => (
          <Line
            key={l.key}
            type="monotone"
            dataKey={l.key}
            name={l.label}
            stroke={CHART_COLORS[i % CHART_COLORS.length]}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function BreakdownBarChart({
  data,
  xKey,
  yKey,
  format = "number",
  height = 240,
}: {
  data: Row[];
  xKey: string;
  yKey: string;
  format?: ValueFormat;
  height?: number;
}) {
  if (data.length === 0) return <EmptyChart height={height} />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
        <XAxis
          dataKey={xKey}
          tick={{ fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          className="fill-muted-foreground"
        />
        <YAxis
          tick={{ fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          width={format === "currency" ? 56 : 36}
          allowDecimals={false}
          className="fill-muted-foreground"
        />
        <Tooltip
          content={(props) => <ChartTooltip {...props} format={format} />}
          cursor={{ fill: "var(--muted)", opacity: 0.4 }}
        />
        <Bar dataKey={yKey} fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DistributionDonutChart({
  data,
  nameKey,
  valueKey,
  format = "number",
  colorKey,
  height = 240,
}: {
  data: Row[];
  nameKey: string;
  valueKey: string;
  format?: ValueFormat;
  /** Optional per-row CSS color field (e.g. theme chart token). */
  colorKey?: string;
  height?: number;
}) {
  if (data.length === 0) return <EmptyChart height={height} />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Tooltip content={(props) => <ChartTooltip {...props} format={format} />} />
        <Pie
          data={data}
          dataKey={valueKey}
          nameKey={nameKey}
          innerRadius="55%"
          outerRadius="85%"
          paddingAngle={2}
        >
          {data.map((row, i) => {
            const custom = colorKey != null ? row[colorKey] : undefined;
            const fill = typeof custom === "string" ? custom : CHART_COLORS[i % CHART_COLORS.length];
            return <Cell key={i} fill={fill} />;
          })}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}
