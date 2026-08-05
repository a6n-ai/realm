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

function ChartTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover text-popover-foreground rounded-md border px-3 py-2 text-xs shadow-md">
      {label != null && <div className="text-muted-foreground mb-1 font-medium">{label}</div>}
      {payload.map((p) => (
        <div key={`${p.dataKey}`} className="flex items-center gap-2">
          <span className="size-2 rounded-full" style={{ background: p.color }} />
          <span>{p.name}</span>
          <span className="ml-auto font-medium tabular-nums">{p.value}</span>
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
  height = 240,
}: {
  data: Row[];
  xKey: string;
  yKey: string;
  height?: number;
}) {
  if (data.length === 0) return <EmptyChart height={height} />;
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
          width={36}
          allowDecimals={false}
          className="fill-muted-foreground"
        />
        <Tooltip content={(props) => <ChartTooltip {...props} />} />
        <Line
          type="monotone"
          dataKey={yKey}
          stroke={CHART_COLORS[0]}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function BreakdownBarChart({
  data,
  xKey,
  yKey,
  height = 240,
}: {
  data: Row[];
  xKey: string;
  yKey: string;
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
          width={36}
          allowDecimals={false}
          className="fill-muted-foreground"
        />
        <Tooltip content={(props) => <ChartTooltip {...props} />} cursor={{ fill: "var(--muted)", opacity: 0.4 }} />
        <Bar dataKey={yKey} fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DistributionDonutChart({
  data,
  nameKey,
  valueKey,
  height = 240,
}: {
  data: Row[];
  nameKey: string;
  valueKey: string;
  height?: number;
}) {
  if (data.length === 0) return <EmptyChart height={height} />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Tooltip content={(props) => <ChartTooltip {...props} />} />
        <Pie
          data={data}
          dataKey={valueKey}
          nameKey={nameKey}
          innerRadius="55%"
          outerRadius="85%"
          paddingAngle={2}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}
