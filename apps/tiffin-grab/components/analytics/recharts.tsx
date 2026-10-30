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
import { cn } from "@foundry/ui/cn";

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

function sliceColor(row: Row, index: number, colorKey?: string): string {
  const custom = colorKey != null ? row[colorKey] : undefined;
  return typeof custom === "string" ? custom : CHART_COLORS[index % CHART_COLORS.length]!;
}

/** Color key under a chart. Donut slices include their value; line series are names only. */
function ChartLegend({
  items,
}: {
  items: { key: string; label: string; color: string; value?: string }[];
}) {
  if (items.length === 0) return null;
  const detailed = items.some((item) => item.value != null);
  return (
    <ul
      className={cn("text-xs", detailed ? "space-y-1.5 pt-3" : "flex flex-wrap gap-x-4 gap-y-1.5 pt-3")}
      aria-label="Legend"
    >
      {items.map((item) => (
        <li key={item.key} className="flex items-center gap-2">
          <span className="size-2.5 shrink-0 rounded-full" style={{ background: item.color }} />
          <span className="text-muted-foreground min-w-0 flex-1">{item.label}</span>
          {item.value != null ? <span className="font-medium tabular-nums">{item.value}</span> : null}
        </li>
      ))}
    </ul>
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
    <div>
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
    {lines.length > 1 ? (
      <ChartLegend
        items={lines.map((l, i) => ({
          key: l.key,
          label: l.label,
          color: CHART_COLORS[i % CHART_COLORS.length]!,
        }))}
      />
    ) : null}
    </div>
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
  legend,
  height = 240,
}: {
  data: Row[];
  nameKey: string;
  valueKey: string;
  format?: ValueFormat;
  /** Optional per-row CSS color field (e.g. theme chart token). */
  colorKey?: string;
  /** Color key under the donut. Turn off when the caller draws its own legend. */
  legend?: boolean;
  height?: number;
}) {
  const slices = data.filter((row) => {
    const value = row[valueKey];
    return typeof value !== "number" || value > 0;
  });
  if (slices.length === 0) return <EmptyChart height={height} />;
  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Tooltip content={(props) => <ChartTooltip {...props} format={format} />} />
          <Pie
            data={slices}
            dataKey={valueKey}
            nameKey={nameKey}
            innerRadius="55%"
            outerRadius="85%"
            paddingAngle={2}
          >
            {slices.map((row, i) => (
              <Cell key={`${row[nameKey]}-${i}`} fill={sliceColor(row, i, colorKey)} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      {legend === false ? null : (
        <ChartLegend
          items={slices.map((row, i) => ({
            key: `${row[nameKey]}-${i}`,
            label: String(row[nameKey] ?? ""),
            color: sliceColor(row, i, colorKey),
            value: formatValue(row[valueKey], format),
          }))}
        />
      )}
    </div>
  );
}
