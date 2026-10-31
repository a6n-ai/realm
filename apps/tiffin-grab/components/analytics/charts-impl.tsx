"use client";

import { useId, useState, type ComponentProps, type ReactNode, type SVGProps } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Label,
  PolarAngleAxis,
  Pie,
  PieChart,
  RadialBar,
  RadialBarChart,
  Sector,
  XAxis,
  YAxis,
  type PieSectorDataItem,
} from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { ChartEmpty } from "@/components/analytics/chart-boundary";
import { keySeries, seriesKey } from "@/components/analytics/series-keys";

// A string, not a formatter function: these charts are rendered from server
// components, and functions cannot cross that boundary as props.
type ValueFormat = "number" | "currency";
type Row = Record<string, string | number>;

const CURRENCY = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" });
const CURRENCY_COMPACT = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  notation: "compact",
  maximumFractionDigits: 1,
});

function formatValue(v: unknown, format: ValueFormat): string {
  if (typeof v !== "number") return String(v);
  return format === "currency" ? CURRENCY.format(v) : v.toLocaleString();
}

// The five theme-aware chart tokens (light/dark are handled by the CSS vars).
const chartColor = (i: number) => `var(--chart-${(i % 5) + 1})`;

type TooltipFormatter = NonNullable<ComponentProps<typeof ChartTooltipContent>["formatter"]>;

const valueFormatter =
  (format: ValueFormat, suffix = ""): TooltipFormatter =>
  (value, name, item) => (
    <div className="flex w-full items-center justify-between gap-2">
      <div className="flex items-center gap-1.5">
        <div
          className="h-2.5 w-2.5 shrink-0 rounded-xs"
          style={{ background: item?.payload?.fill ?? item?.color }}
        />
        <span className="text-muted-foreground">{name}</span>
      </div>
      <span className="text-foreground font-semibold tabular-nums">
        {formatValue(value, format)}
        {suffix}
      </span>
    </div>
  );

const headerLabel = (value: ReactNode) => (
  <div className="border-border/50 mb-0.5 border-b pb-2">
    <span className="text-xs font-medium">{value}</span>
  </div>
);

function EmptyChart() {
  return <ChartEmpty message="No data in this range." />;
}

function sliceColor(row: Row, index: number, colorKey?: string): string {
  const custom = colorKey != null ? row[colorKey] : undefined;
  return typeof custom === "string" ? custom : chartColor(index);
}

/** c-chart-13: gradient area. Several series share the composition. */
export function TrendLineChart({
  data,
  xKey,
  yKey,
  label = "Value",
  series,
  format = "number",
  height = 240,
}: {
  data: Row[];
  xKey: string;
  yKey?: string;
  /** Series name for the single-`yKey` form (tooltip, legend). */
  label?: string;
  /** Several named series; takes precedence over `yKey`. */
  series?: { key: string; label: string }[];
  format?: ValueFormat;
  height?: number;
}) {
  const uid = useId().replace(/:/g, "");
  if (data.length === 0) return <EmptyChart />;
  const lines = series ?? (yKey ? [{ key: yKey, label }] : []);
  const config = Object.fromEntries(
    lines.map((l) => [l.key, { label: l.label }]),
  ) satisfies ChartConfig;
  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
      <AreaChart accessibilityLayer data={data} margin={{ top: 20, right: 0, bottom: 0, left: 0 }}>
        <defs>
          {lines.map((l, i) => (
            <linearGradient key={l.key} id={`${uid}-g${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={chartColor(i)} stopOpacity={0.5} />
              <stop offset="95%" stopColor={chartColor(i)} stopOpacity={0.05} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey={xKey} tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
        <YAxis hide domain={[0, "auto"]} />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              indicator="dot"
              className="min-w-40 gap-2.5"
              labelFormatter={headerLabel}
              formatter={valueFormatter(format)}
            />
          }
        />
        {lines.map((l, i) => (
          <Area
            key={l.key}
            dataKey={l.key}
            name={l.label}
            type="monotone"
            fill={`url(#${uid}-g${i})`}
            stroke={chartColor(i)}
            strokeWidth={2}
          />
        ))}
        {lines.length > 1 ? <ChartLegend content={<ChartLegendContent />} /> : null}
      </AreaChart>
    </ChartContainer>
  );
}

const truncate = (v: unknown) => {
  const s = String(v);
  return s.length > 16 ? `${s.slice(0, 15)}…` : s;
};

/**
 * c-chart-12 horizontal bars (default, for category labels such as cities, drivers,
 * plans) or c-chart-1 vertical bars (`orientation="vertical"`, for time or short labels).
 */
export function BreakdownBarChart({
  data,
  xKey,
  yKey,
  label = "Value",
  format = "number",
  orientation = "horizontal",
  height = 240,
}: {
  data: Row[];
  xKey: string;
  yKey: string;
  label?: string;
  format?: ValueFormat;
  orientation?: "horizontal" | "vertical";
  height?: number;
}) {
  if (data.length === 0) return <EmptyChart />;
  const config = { [yKey]: { label, color: chartColor(0) } } satisfies ChartConfig;
  const tooltip = (
    <ChartTooltip
      cursor={false}
      content={
        <ChartTooltipContent
          indicator="dot"
          className="min-w-40 gap-2.5"
          labelFormatter={headerLabel}
          formatter={valueFormatter(format)}
        />
      }
    />
  );
  if (orientation === "vertical") {
    return (
      <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
        <BarChart accessibilityLayer data={data}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey={xKey} tickLine={false} axisLine={false} tickMargin={8} />
          {tooltip}
          <Bar dataKey={yKey} name={label} fill={chartColor(0)} radius={4} />
        </BarChart>
      </ChartContainer>
    );
  }
  return (
    <ChartContainer
      config={config}
      className="aspect-auto w-full"
      style={{ height: Math.max(height, data.length * 32) }}
    >
      <BarChart
        accessibilityLayer
        data={data}
        layout="vertical"
        margin={{ left: -10, right: 20 }}
        barCategoryGap="30%"
      >
        <YAxis
          type="category"
          dataKey={xKey}
          tickLine={false}
          tickMargin={10}
          axisLine={false}
          width={110}
          tickFormatter={truncate}
        />
        <XAxis type="number" tickLine={false} tickMargin={10} axisLine={false} hide />
        {tooltip}
        <Bar dataKey={yKey} name={label} fill={chartColor(0)} radius={2} />
      </BarChart>
    </ChartContainer>
  );
}

function legendList(items: { key: string; label: string; color: string; value: string }[]) {
  return (
    <ul className="flex flex-col gap-1.5 pt-3 text-xs" aria-label="Legend">
      {items.map((item) => (
        <li key={item.key} className="flex items-center gap-2">
          <span className="size-2.5 shrink-0 rounded-full" style={{ background: item.color }} />
          <span className="text-muted-foreground min-w-0 flex-1">{item.label}</span>
          <span className="font-medium tabular-nums">{item.value}</span>
        </li>
      ))}
    </ul>
  );
}

function donutCentre(total: number, format: ValueFormat, caption: string) {
  const text = format === "currency" ? CURRENCY_COMPACT.format(total) : total.toLocaleString();
  return (
    <Label
      content={({ viewBox }) => {
        if (viewBox && "cx" in viewBox && "cy" in viewBox) {
          return (
            <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
              <tspan x={viewBox.cx} y={viewBox.cy} className="fill-foreground text-2xl font-bold tabular-nums">
                {text}
              </tspan>
              <tspan x={viewBox.cx} y={(viewBox.cy || 0) + 22} className="fill-muted-foreground text-xs">
                {caption}
              </tspan>
            </text>
          );
        }
      }}
    />
  );
}

type DonutProps = {
  data: Row[];
  nameKey: string;
  valueKey: string;
  format?: ValueFormat;
  /** Optional per-row CSS color field (e.g. theme chart token). */
  colorKey?: string;
  /** Value list under the donut. Turn off when the caller draws its own legend. */
  legend?: boolean;
  height?: number;
};

function useSlices({ data, nameKey, valueKey, colorKey }: DonutProps) {
  const slices = data
    .filter((row) => {
      const value = row[valueKey];
      return typeof value !== "number" || value > 0;
    })
    .map((row, i): Row => ({ ...row, fill: sliceColor(row, i, colorKey) }));
  const total = slices.reduce((sum, r) => sum + (Number(r[valueKey]) || 0), 0);
  const config = Object.fromEntries(
    slices.map((r) => [String(r[nameKey]), { label: String(r[nameKey] ?? "") }]),
  ) satisfies ChartConfig;
  return { slices, total, config };
}

/** c-chart-19 donut with the total in the centre. */
export function DistributionDonutChart(props: DonutProps) {
  const { nameKey, valueKey, format = "number", legend = true, height = 240 } = props;
  const { slices, total, config } = useSlices(props);
  if (slices.length === 0) return <EmptyChart />;
  return (
    <div>
      <ChartContainer config={config} className="mx-auto aspect-square" style={{ height }}>
        <PieChart accessibilityLayer>
          <ChartTooltip
            content={<ChartTooltipContent className="min-w-40 gap-2.5" formatter={valueFormatter(format)} />}
          />
          <Pie
            data={slices}
            dataKey={valueKey}
            nameKey={nameKey}
            innerRadius="65%"
            outerRadius="95%"
            cornerRadius={8}
            paddingAngle={4}
            stroke="var(--background)"
            strokeWidth={4}
          >
            {slices.map((row, i) => (
              <Cell key={`${row[nameKey]}-${i}`} fill={String(row.fill)} />
            ))}
            {donutCentre(total, format, "Total")}
          </Pie>
        </PieChart>
      </ChartContainer>
      {legend
        ? legendList(
            slices.map((row, i) => ({
              key: `${row[nameKey]}-${i}`,
              label: String(row[nameKey] ?? ""),
              color: String(row.fill),
              value: formatValue(row[valueKey], format),
            })),
          )
        : null}
    </div>
  );
}

/** c-chart-22 donut: the hovered slice grows, the legend names every slice. */
export function ActiveSegmentDonutChart(props: DonutProps) {
  const { nameKey, valueKey, format = "number", height = 280 } = props;
  const { slices, total, config } = useSlices(props);
  if (slices.length === 0) return <EmptyChart />;
  return (
    <ChartContainer config={config} className="mx-auto aspect-square" style={{ height }}>
      <PieChart accessibilityLayer>
        <ChartTooltip
          content={<ChartTooltipContent className="min-w-40 gap-2.5" formatter={valueFormatter(format)} />}
        />
        <ChartLegend content={<ChartLegendContent nameKey={nameKey} className="-translate-y-2 flex-wrap" />} />
        <Pie
          data={slices}
          dataKey={valueKey}
          nameKey={nameKey}
          innerRadius="55%"
          cornerRadius={5}
          paddingAngle={3}
          stroke="var(--background)"
          strokeWidth={3}
          activeShape={({ outerRadius = 0, ...p }: PieSectorDataItem) => (
            <Sector {...p} outerRadius={outerRadius + 10} />
          )}
        >
          {slices.map((row, i) => (
            <Cell key={`${row[nameKey]}-${i}`} fill={String(row.fill)} />
          ))}
          {donutCentre(total, format, "Total")}
        </Pie>
      </PieChart>
    </ChartContainer>
  );
}

const COLLAPSED_WIDTH = 6;

type HoverBarProps = SVGProps<SVGRectElement> & {
  index?: number;
  activeIndex?: number;
  onActive: (index?: number) => void;
};

// Resting bars are slim; the hovered one widens. scaleX (not width) keeps it a transform-only animation.
function HoverBar({ x, y, width, height, fill, index, activeIndex, onActive }: HoverBarProps) {
  const w = Number(width || 0);
  const active = index === activeIndex;
  return (
    <g onMouseEnter={() => onActive(index)}>
      <rect
        x={Number(x || 0)}
        y={y}
        width={w}
        height={height}
        fill={fill}
        rx={3}
        className="origin-center transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] [transform-box:fill-box] motion-reduce:transition-none"
        style={{ transform: `scaleX(${active || w === 0 ? 1 : Math.min(1, COLLAPSED_WIDTH / w)})` }}
      />
    </g>
  );
}

/** c-chart-11: slim bars; the figure above follows the hovered bar (the total otherwise). */
export function HoverValueBarChart({
  data,
  xKey,
  yKey,
  label = "Value",
  format = "number",
  height = 240,
  totalLabel = "Total",
}: {
  data: Row[];
  xKey: string;
  yKey: string;
  label?: string;
  format?: ValueFormat;
  height?: number;
  totalLabel?: string;
}) {
  const [activeIndex, setActiveIndex] = useState<number | undefined>(undefined);
  if (data.length === 0) return <EmptyChart />;
  const config = { [yKey]: { label, color: chartColor(0) } } satisfies ChartConfig;
  const active = activeIndex === undefined ? undefined : data[activeIndex];
  const figure = active
    ? Number(active[yKey]) || 0
    : data.reduce((sum, r) => sum + (Number(r[yKey]) || 0), 0);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-muted-foreground text-sm">{active ? String(active[xKey]) : totalLabel}</span>
        <span className="text-xl font-semibold tracking-tight tabular-nums">{formatValue(figure, format)}</span>
      </div>
      <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
        <BarChart
          accessibilityLayer
          data={data}
          onMouseLeave={() => setActiveIndex(undefined)}
          margin={{ top: 20, right: 12, bottom: 12, left: 12 }}
        >
          <XAxis dataKey={xKey} tickLine={false} tickMargin={10} axisLine={false} minTickGap={24} />
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                indicator="dot"
                className="min-w-40 gap-2.5"
                labelFormatter={headerLabel}
                formatter={valueFormatter(format)}
              />
            }
          />
          <Bar
            dataKey={yKey}
            name={yKey}
            fill={chartColor(0)}
            shape={(p: unknown) => (
              <HoverBar {...(p as HoverBarProps)} activeIndex={activeIndex} onActive={setActiveIndex} />
            )}
          />
        </BarChart>
      </ChartContainer>
    </div>
  );
}

/** c-chart-2: two or more series side by side. */
export function GroupedBarChart({
  data,
  xKey,
  series,
  format = "number",
  height = 240,
  legend = false,
}: {
  data: Row[];
  xKey: string;
  series: { key: string; label: string }[];
  /** Name the series even when there is only one. */
  legend?: boolean;
  format?: ValueFormat;
  height?: number;
}) {
  if (data.length === 0) return <EmptyChart />;
  const { rows } = keySeries(data, series);
  const config = Object.fromEntries(
    series.map((s, i) => [seriesKey(i), { label: s.label, color: chartColor(i) }]),
  ) satisfies ChartConfig;
  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
      <BarChart accessibilityLayer data={rows}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey={xKey} tickLine={false} tickMargin={10} axisLine={false} minTickGap={24} />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              indicator="dot"
              className="min-w-40 gap-2.5"
              labelFormatter={headerLabel}
              formatter={valueFormatter(format)}
            />
          }
        />
        {series.map((s, i) => (
          <Bar key={seriesKey(i)} dataKey={seriesKey(i)} name={s.label} fill={chartColor(i)} radius={4} />
        ))}
        {legend || series.length > 1 ? <ChartLegend content={<ChartLegendContent />} /> : null}
      </BarChart>
    </ChartContainer>
  );
}

/** c-chart-25: radial bars on a 0-100 track. Values are percentages. */
export function RadialRateChart({
  data,
  nameKey,
  valueKey,
  height = 260,
}: {
  data: Row[];
  nameKey: string;
  valueKey: string;
  height?: number;
}) {
  if (data.length === 0) return <EmptyChart />;
  const rows = data.map((r, i): Row => ({ ...r, fill: chartColor(i) }));
  const config = Object.fromEntries(
    rows.map((r) => [String(r[nameKey]), { label: String(r[nameKey] ?? "") }]),
  ) satisfies ChartConfig;
  return (
    <ChartContainer config={config} className="mx-auto aspect-square" style={{ height }}>
      <RadialBarChart accessibilityLayer data={rows} innerRadius="30%" outerRadius="100%" barSize={22}>
        <ChartTooltip
          content={
            <ChartTooltipContent
              className="min-w-40 gap-2.5"
              nameKey={nameKey}
              formatter={valueFormatter("number", "%")}
            />
          }
        />
        <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
        <RadialBar
          dataKey={valueKey}
          background
          cornerRadius={10}
          label={{ position: "insideStart", fill: "var(--background)", fontSize: 12, fontWeight: 600, formatter: (v: unknown) => `${v}%` }}
        />
        <ChartLegend content={<ChartLegendContent nameKey={nameKey} className="-translate-y-2" />} />
      </RadialBarChart>
    </ChartContainer>
  );
}
