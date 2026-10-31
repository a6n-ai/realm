"use client";

import { useRouter } from "next/navigation";
import {
  useId,
  useState,
  type ComponentProps,
  type ReactNode,
  type SVGProps,
} from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Label,
  LabelList,
  Line,
  LineChart,
  ReferenceLine,
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@foundry/ui/cn";
import { ChartEmpty } from "@/components/analytics/chart-boundary";
import { keySeries, seriesKey } from "@/components/analytics/series-keys";
import {
  axisTicks,
  chartColor as tokenColor,
  foldParts,
  funnelStages,
  heatBucket,
  heatOpacity,
  HEAT_STEPS,
  heatIsDense,
  moneyTick,
  positionalConfig,
  rankedHeight,
  TONE_COLOR,
  tickEvery,
  topWithOther,
  truncateLabel,
  type Part,
  type Tone,
} from "@/components/analytics/chart-math";

// A string, not a formatter function: these charts are rendered from server
// components, and functions cannot cross that boundary as props.
type ValueFormat = "number" | "currency";
type Row = Record<string, string | number>;

const CURRENCY = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
});
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

type TooltipFormatter = NonNullable<
  ComponentProps<typeof ChartTooltipContent>["formatter"]
>;

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
  mode = "area",
  format = "number",
  height = 240,
}: {
  data: Row[];
  xKey: string;
  yKey?: string;
  /** "line" draws plain 2px lines (use for 2 series sharing one axis); keyed by position. */
  mode?: "area" | "line";
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
  if (mode === "line")
    return (
      <SeriesLines
        data={data}
        xKey={xKey}
        series={lines}
        format={format}
        height={height}
      />
    );
  const config = Object.fromEntries(
    lines.map((l) => [l.key, { label: l.label }]),
  ) satisfies ChartConfig;
  return (
    <ChartContainer
      config={config}
      className="aspect-auto w-full"
      style={{ height }}
    >
      <AreaChart
        accessibilityLayer
        data={data}
        margin={{ top: 20, right: 0, bottom: 0, left: 0 }}
      >
        <defs>
          {lines.map((l, i) => (
            <linearGradient
              key={l.key}
              id={`${uid}-g${i}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="5%" stopColor={chartColor(i)} stopOpacity={0.5} />
              <stop offset="95%" stopColor={chartColor(i)} stopOpacity={0.05} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey={xKey}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={24}
        />
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
        {lines.length > 1 ? (
          <ChartLegend content={<ChartLegendContent />} />
        ) : null}
      </AreaChart>
    </ChartContainer>
  );
}

function SeriesLines({
  data,
  xKey,
  series,
  format,
  height,
}: {
  data: Row[];
  xKey: string;
  series: { key: string; label: string }[];
  format: ValueFormat;
  height: number;
}) {
  const { rows, keys } = keySeries(data, series);
  const config = positionalConfig(series) satisfies ChartConfig;
  const hasNegative = rows.some((r) => keys.some((k) => Number(r[k]) < 0));
  const last = rows.length - 1;
  // Direct labels collide when the series end close together; the legend still names them.
  const ends = keys.map((k) => Number(rows[last]?.[k]) || 0);
  const all = rows.flatMap((r) => keys.map((k) => Number(r[k]) || 0));
  const range =
    Math.max(...all) - Math.min(hasNegative ? Math.min(...all) : 0, ...all) ||
    1;
  const labelEnds =
    keys.length < 2 || (Math.max(...ends) - Math.min(...ends)) / range >= 0.08;
  return (
    <ChartContainer
      config={config}
      className="aspect-auto w-full"
      style={{ height }}
    >
      <LineChart
        accessibilityLayer
        data={rows}
        margin={{ top: 20, right: 56, bottom: 0, left: 0 }}
      >
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey={xKey}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={24}
        />
        <YAxis hide domain={[hasNegative ? "auto" : 0, "auto"]} />
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
          <Line
            key={keys[i]}
            dataKey={keys[i]}
            name={s.label}
            type="monotone"
            stroke={tokenColor(i)}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
            label={({
              index,
              x,
              y,
            }: {
              index?: number;
              x?: string | number;
              y?: string | number;
            }) =>
              labelEnds && index === last ? (
                <text
                  key={keys[i]}
                  x={Number(x) + 6}
                  y={Number(y)}
                  dominantBaseline="middle"
                  className="fill-muted-foreground text-xs"
                >
                  {s.label.length > 10 ? `${s.label.slice(0, 9)}…` : s.label}
                </text>
              ) : (
                <g key={`${keys[i]}-${index}`} />
              )
            }
          />
        ))}
        <ChartLegend content={<ChartLegendContent />} />
      </LineChart>
    </ChartContainer>
  );
}

const truncate = (v: unknown) => truncateLabel(v);

/** Tooltip heading: the row's long date when `tipKey` is set, else the axis label. */
const tipHeader = (tipKey?: string) => (value: ReactNode, payload: readonly { payload?: Row }[]) =>
  headerLabel((tipKey ? payload?.[0]?.payload?.[tipKey] : undefined) ?? value);

/** Value-axis props shared by the vertical bar charts: [0, nice max], about five ticks, compact money. */
function valueAxis(values: number[], format: ValueFormat) {
  const ticks = axisTicks(Math.max(0, ...values), format === "number");
  return {
    ticks,
    domain: [0, ticks.at(-1)!] as [number, number],
    allowDecimals: false,
    tickFormatter: (v: number) => (format === "currency" ? moneyTick(v) : v.toLocaleString()),
    width: format === "currency" ? 44 : 36,
    tickLine: false,
    axisLine: false,
    tickMargin: 4,
  };
}

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
  limit = 8,
  hrefKey,
}: {
  data: Row[];
  xKey: string;
  yKey: string;
  label?: string;
  format?: ValueFormat;
  /** Horizontal charts only: row field holding a URL; clicking that bar navigates there. */
  hrefKey?: string;
  orientation?: "horizontal" | "vertical";
  /** Vertical charts only; horizontal height follows the row count. */
  height?: number;
  /** Horizontal charts only: rows kept before the tail folds into "Other". */
  limit?: number;
}) {
  const router = useRouter();
  if (data.length === 0) return <EmptyChart />;
  const config = {
    [yKey]: { label, color: chartColor(0) },
  } satisfies ChartConfig;
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
      <ChartContainer
        config={config}
        className="aspect-auto w-full"
        style={{ height }}
      >
        <BarChart accessibilityLayer data={data}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey={xKey}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
          />
          {tooltip}
          <Bar
            dataKey={yKey}
            name={label}
            fill={chartColor(0)}
            radius={4}
            maxBarSize={32}
          />
        </BarChart>
      </ChartContainer>
    );
  }
  const ranked = topWithOther(data, xKey, yKey, limit);
  return (
    <ChartContainer
      config={config}
      className="aspect-auto w-full"
      style={{ height: rankedHeight(ranked.length) }}
    >
      <BarChart
        accessibilityLayer
        data={ranked}
        layout="vertical"
        margin={{ left: -10, right: 48 }}
        barCategoryGap="30%"
      >
        <YAxis
          type="category"
          dataKey={xKey}
          tickLine={false}
          tickMargin={10}
          axisLine={false}
          width={120}
          tickFormatter={truncate}
        />
        <XAxis
          type="number"
          tickLine={false}
          tickMargin={10}
          axisLine={false}
          hide
        />
        {tooltip}
        <Bar
          dataKey={yKey}
          name={label}
          fill={chartColor(0)}
          radius={2}
          maxBarSize={32}
          cursor={hrefKey ? "pointer" : undefined}
          onClick={(d: { payload?: Row }) => {
            const href = hrefKey ? d.payload?.[hrefKey] : undefined;
            if (typeof href === "string") router.push(href);
          }}
        >
          <LabelList
            dataKey={yKey}
            position="right"
            className="fill-foreground text-xs font-medium tabular-nums"
            formatter={(v: unknown) => formatValue(v, format)}
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

function legendList(
  items: { key: string; label: string; color: string; value: string }[],
) {
  return (
    <ul className="flex flex-col gap-1.5 pt-3 text-xs" aria-label="Legend">
      {items.map((item) => (
        <li key={item.key} className="flex items-center gap-2">
          <span
            className="size-2.5 shrink-0 rounded-full"
            style={{ background: item.color }}
          />
          <span className="text-muted-foreground min-w-0 flex-1">
            {item.label}
          </span>
          <span className="font-medium tabular-nums">{item.value}</span>
        </li>
      ))}
    </ul>
  );
}

function donutCentre(total: number, format: ValueFormat, caption: string) {
  const text =
    format === "currency"
      ? CURRENCY_COMPACT.format(total)
      : total.toLocaleString();
  return (
    <Label
      content={({ viewBox }) => {
        if (viewBox && "cx" in viewBox && "cy" in viewBox) {
          return (
            <text
              x={viewBox.cx}
              y={viewBox.cy}
              textAnchor="middle"
              dominantBaseline="middle"
            >
              <tspan
                x={viewBox.cx}
                y={viewBox.cy}
                className="fill-foreground text-2xl font-bold tabular-nums"
              >
                {text}
              </tspan>
              <tspan
                x={viewBox.cx}
                y={(viewBox.cy || 0) + 22}
                className="fill-muted-foreground text-xs"
              >
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
    slices.map((r) => [
      String(r[nameKey]),
      { label: String(r[nameKey] ?? "") },
    ]),
  ) satisfies ChartConfig;
  return { slices, total, config };
}

/** c-chart-19 donut with the total in the centre. */
export function DistributionDonutChart(props: DonutProps) {
  const {
    nameKey,
    valueKey,
    format = "number",
    legend = true,
    height = 240,
  } = props;
  const { slices, total, config } = useSlices(props);
  if (slices.length === 0) return <EmptyChart />;
  return (
    <div>
      <ChartContainer
        config={config}
        className="mx-auto aspect-square"
        style={{ height }}
      >
        <PieChart accessibilityLayer>
          <ChartTooltip
            content={
              <ChartTooltipContent
                className="min-w-40 gap-2.5"
                formatter={valueFormatter(format)}
              />
            }
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
    <ChartContainer
      config={config}
      className="mx-auto aspect-square"
      style={{ height }}
    >
      <PieChart accessibilityLayer>
        <ChartTooltip
          content={
            <ChartTooltipContent
              className="min-w-40 gap-2.5"
              formatter={valueFormatter(format)}
            />
          }
        />
        <ChartLegend
          content={
            <ChartLegendContent
              nameKey={nameKey}
              className="-translate-y-2 flex-wrap"
            />
          }
        />
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
function HoverBar({
  x,
  y,
  width,
  height,
  fill,
  index,
  activeIndex,
  onActive,
}: HoverBarProps) {
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
        style={{
          transform: `scaleX(${active || w === 0 ? 1 : Math.min(1, COLLAPSED_WIDTH / w)})`,
        }}
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
  tipKey,
}: {
  data: Row[];
  xKey: string;
  yKey: string;
  label?: string;
  format?: ValueFormat;
  height?: number;
  totalLabel?: string;
  /** Row field with the long date shown in the figure and tooltip ("Sat, Oct 3"). */
  tipKey?: string;
}) {
  const [activeIndex, setActiveIndex] = useState<number | undefined>(undefined);
  if (data.length === 0 || data.every((r) => !Number(r[yKey]))) return <EmptyChart />;
  const config = {
    [yKey]: { label, color: chartColor(0) },
  } satisfies ChartConfig;
  const active = activeIndex === undefined ? undefined : data[activeIndex];
  const figure = active
    ? Number(active[yKey]) || 0
    : data.reduce((sum, r) => sum + (Number(r[yKey]) || 0), 0);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-muted-foreground text-sm">
          {active ? String((tipKey && active[tipKey]) || active[xKey]) : totalLabel}
        </span>
        <span className="text-xl font-semibold tracking-tight tabular-nums">
          {formatValue(figure, format)}
        </span>
      </div>
      <ChartContainer
        config={config}
        className="aspect-auto w-full"
        style={{ height }}
      >
        <BarChart
          accessibilityLayer
          data={data}
          onMouseLeave={() => setActiveIndex(undefined)}
          margin={{ top: 20, right: 12, bottom: 12, left: 0 }}
        >
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis
            dataKey={xKey}
            tickLine={false}
            tickMargin={10}
            axisLine={false}
            minTickGap={24}
            interval={tickEvery(data.length)}
          />
          <YAxis {...valueAxis(data.map((r) => Number(r[yKey]) || 0), format)} />
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                indicator="dot"
                className="min-w-40 gap-2.5"
                labelFormatter={tipHeader(tipKey)}
                formatter={valueFormatter(format)}
              />
            }
          />
          <Bar
            dataKey={yKey}
            name={yKey}
            fill={chartColor(0)}
            shape={(p: unknown) => (
              <HoverBar
                {...(p as HoverBarProps)}
                activeIndex={activeIndex}
                onActive={setActiveIndex}
              />
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
    series.map((s, i) => [
      seriesKey(i),
      { label: s.label, color: chartColor(i) },
    ]),
  ) satisfies ChartConfig;
  return (
    <ChartContainer
      config={config}
      className="aspect-auto w-full"
      style={{ height }}
    >
      <BarChart accessibilityLayer data={rows}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey={xKey}
          tickLine={false}
          tickMargin={10}
          axisLine={false}
          minTickGap={24}
        />
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
          <Bar
            key={seriesKey(i)}
            dataKey={seriesKey(i)}
            name={s.label}
            fill={chartColor(i)}
            radius={4}
          />
        ))}
        {legend || series.length > 1 ? (
          <ChartLegend content={<ChartLegendContent />} />
        ) : null}
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
    <ChartContainer
      config={config}
      className="mx-auto aspect-square"
      style={{ height }}
    >
      <RadialBarChart
        accessibilityLayer
        data={rows}
        innerRadius="30%"
        outerRadius="100%"
        barSize={22}
      >
        <ChartTooltip
          content={
            <ChartTooltipContent
              className="min-w-40 gap-2.5"
              nameKey={nameKey}
              formatter={valueFormatter("number", "%")}
            />
          }
        />
        <PolarAngleAxis
          type="number"
          domain={[0, 100]}
          angleAxisId={0}
          tick={false}
        />
        <RadialBar
          dataKey={valueKey}
          background
          cornerRadius={10}
          label={{
            position: "insideStart",
            fill: "var(--background)",
            fontSize: 12,
            fontWeight: 600,
            formatter: (v: unknown) => `${v}%`,
          }}
        />
        <ChartLegend
          content={
            <ChartLegendContent nameKey={nameKey} className="-translate-y-2" />
          }
        />
      </RadialBarChart>
    </ChartContainer>
  );
}

const fmtPct = (n: number) => `${n}%`;

/** One whole split into at most 6 parts. Status parts use status tokens, the rest var(--chart-N) in order. */
export function SegmentedBar({
  parts,
  format = "number",
  withList = false,
  max = 5,
}: {
  parts: Part[];
  format?: ValueFormat;
  /** Parts kept before the tail folds into "Other" (the lead pipeline has six). */
  max?: number;
  /** Name, value and share per part under the bar, in BreakdownList's row style. */
  withList?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const folded = foldParts(parts, max);
  if (folded.length === 0) return <EmptyChart />;
  const total = folded.reduce((s, p) => s + p.value, 0);
  return (
    <div className="flex flex-col gap-3">
      <TooltipProvider>
        <div
          className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full"
          onMouseLeave={() => setHover(null)}
        >
          {folded.map((p, i) => {
            const text = `${p.label}: ${formatValue(p.value, format)} (${fmtPct(p.share)})`;
            return (
              <Tooltip key={`${p.label}-${i}`}>
                <TooltipTrigger asChild>
                  <div
                    tabIndex={0}
                    aria-label={text}
                    className="focus-visible:ring-ring/50 relative h-full outline-none transition-opacity first:rounded-l-full last:rounded-r-full focus-visible:ring-2"
                    style={{
                      width: `${(p.value / total) * 100}%`,
                      background: p.color,
                      opacity: hover === null || hover === i ? 1 : 0.45,
                    }}
                    onMouseEnter={() => setHover(i)}
                    onFocus={() => setHover(i)}
                    onBlur={() => setHover(null)}
                  />
                </TooltipTrigger>
                <TooltipContent>{text}</TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </TooltipProvider>
      {withList ? (
        <ul className="divide-border/60 divide-y">
          {folded.map((p, i) => (
            <li
              key={`${p.label}-${i}`}
              className="flex items-center gap-2 py-2 text-sm"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ background: p.color }}
              />
              <span className="min-w-0 flex-1 truncate">{p.label}</span>
              <span className="font-semibold tabular-nums">
                {formatValue(p.value, format)}
              </span>
              <span className="text-muted-foreground w-10 text-right text-xs tabular-nums">
                {fmtPct(p.share)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <ul
          className="flex flex-wrap gap-x-4 gap-y-1 text-xs"
          aria-label="Legend"
        >
          {folded.map((p, i) => (
            <li key={`${p.label}-${i}`} className="flex items-center gap-1.5">
              <span
                className="size-2.5 rounded-full"
                style={{ background: p.color }}
              />
              <span className="text-muted-foreground">{p.label}</span>
              <span className="font-medium tabular-nums">
                {fmtPct(p.share)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Ordered stages (not sorted) as horizontal bars on one baseline, with the % kept from the stage before. */
export function FunnelChart({
  stages,
  format = "number",
}: {
  stages: { label: string; value: number }[];
  format?: ValueFormat;
}) {
  if (stages.length === 0 || stages.every((s) => s.value <= 0))
    return <EmptyChart />;
  const rows = funnelStages(stages);
  return (
    <TooltipProvider>
      <ul className="flex flex-col gap-2" aria-label="Funnel">
        {rows.map((r, i) => (
          <li key={`${r.label}-${i}`} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate">{r.label}</span>
              <span className="flex items-baseline gap-2">
                <span className="font-semibold tabular-nums">
                  {formatValue(r.value, format)}
                </span>
                {r.kept !== null ? (
                  <span className="text-muted-foreground w-24 text-right text-xs tabular-nums">
                    {fmtPct(r.kept)} kept
                  </span>
                ) : null}
              </span>
            </div>
            {(() => {
              const text = `${r.label}: ${formatValue(r.value, format)}${r.kept !== null ? ` (${r.kept}% kept)` : ""}`;
              return (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      tabIndex={0}
                      aria-label={text}
                      className="bg-muted focus-visible:ring-ring/50 h-3 w-full overflow-hidden rounded-sm outline-none focus-visible:ring-2"
                    >
                      <div
                        className="h-full rounded-sm"
                        style={{
                          width: `${r.width}%`,
                          background: tokenColor(0),
                        }}
                      />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>{text}</TooltipContent>
                </Tooltip>
              );
            })()}
          </li>
        ))}
      </ul>
    </TooltipProvider>
  );
}

/** Rows x columns of amounts. One hue, stepped opacity; empty cells read "—". */
export function HeatmapGrid({
  rows,
  columns,
  cells,
  format = "number",
}: {
  rows: string[];
  columns: string[];
  /** cells[r][c]; null or 0 is an empty cell. */
  cells: (number | null)[][];
  format?: ValueFormat;
}) {
  const values = cells
    .flat()
    .filter((v): v is number => typeof v === "number" && v > 0);
  if (rows.length === 0 || columns.length === 0 || values.length === 0)
    return <EmptyChart />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  return (
    <TooltipProvider>
      <div className="flex flex-col gap-3">
        <div
          role="table"
          className="grid items-stretch gap-0.5 text-sm"
          style={{
            gridTemplateColumns: `minmax(0, auto) repeat(${columns.length}, minmax(0, 1fr))`,
          }}
        >
          <div role="row" className="contents">
            <div role="columnheader" />
            {columns.map((c, ci) => (
              <div
                key={`${c}-${ci}`}
                role="columnheader"
                className="text-muted-foreground truncate px-2 pb-1 text-center text-xs"
              >
                {c}
              </div>
            ))}
          </div>
          {rows.map((r, ri) => (
            <div key={`${r}-${ri}`} role="row" className="contents">
              <div
                role="rowheader"
                className="text-muted-foreground flex items-center truncate pr-2 text-xs"
              >
                {r}
              </div>
              {columns.map((c, ci) => {
                const v = cells[ri]?.[ci] ?? null;
                const b = heatBucket(v, min, max);
                const shown = v == null ? "\u2014" : formatValue(v, format);
                const text = `${r} / ${c}: ${v == null ? "no data" : shown}`;
                return (
                  <Tooltip key={`${c}-${ci}`}>
                    <TooltipTrigger asChild>
                      <div
                        role="cell"
                        tabIndex={0}
                        aria-label={text}
                        className="focus-visible:ring-ring/50 relative flex min-h-10 items-center justify-center overflow-hidden rounded-sm px-2 py-2 text-xs tabular-nums outline-none focus-visible:ring-2"
                      >
                        <span
                          aria-hidden
                          className="absolute inset-0"
                          style={{
                            background: tokenColor(0),
                            opacity: heatOpacity(b),
                          }}
                        />
                        <span
                          className={cn(
                            "relative",
                            b === 0
                              ? "text-muted-foreground"
                              : heatIsDense(b)
                                ? "text-background font-medium"
                                : "text-foreground font-medium",
                          )}
                        >
                          {shown}
                        </span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>{text}</TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          ))}
        </div>
        <div
          className="text-muted-foreground flex items-center gap-2 text-xs"
          aria-hidden
        >
          <span>{formatValue(min, format)}</span>
          <div className="flex h-2 flex-1 overflow-hidden rounded-sm">
            {Array.from({ length: HEAT_STEPS }, (_, i) => (
              <span
                key={i}
                className="flex-1"
                style={{
                  background: tokenColor(0),
                  opacity: heatOpacity(i + 1),
                }}
              />
            ))}
          </div>
          <span>{formatValue(max, format)}</span>
        </div>
      </div>
    </TooltipProvider>
  );
}

/** Bars from a 0 baseline: positive in the success token, negative in destructive. */
export function DivergingBarChart({
  data,
  xKey,
  yKey,
  label = "Value",
  format = "number",
  height = 240,
  tipKey,
}: {
  data: Row[];
  xKey: string;
  yKey: string;
  label?: string;
  format?: ValueFormat;
  height?: number;
  tipKey?: string;
}) {
  if (data.length === 0) return <EmptyChart />;
  const rows = data.map((r) => {
    const s0 = Number(r[yKey]) || 0;
    return { ...r, s0, fill: s0 < 0 ? "var(--destructive)" : "var(--success)" };
  });
  const config = positionalConfig([{ label }]) satisfies ChartConfig;
  return (
    <ChartContainer
      config={config}
      className="aspect-auto w-full"
      style={{ height }}
    >
      <BarChart accessibilityLayer data={rows}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey={xKey}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={24}
          interval={tickEvery(rows.length)}
        />
        <YAxis
          domain={["auto", "auto"]}
          tickLine={false}
          axisLine={false}
          tickMargin={4}
          width={48}
          allowDecimals={false}
          tickFormatter={(v: number) => (format === "currency" ? moneyTick(v) : v.toLocaleString())}
        />
        <ReferenceLine y={0} stroke="var(--border)" />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              indicator="dot"
              className="min-w-40 gap-2.5"
              labelFormatter={tipHeader(tipKey)}
              formatter={valueFormatter(format)}
            />
          }
        />
        <Bar dataKey="s0" name={label} radius={3} maxBarSize={32}>
          {rows.map((r, i) => (
            <Cell key={i} fill={r.fill} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

/** Daily stacked bars by status: status tones, 2px gap between segments, tooltip lists every status and the total. */
export function StackedBarChart({
  data,
  xKey,
  series,
  tipKey,
  height = 280,
}: {
  data: Row[];
  xKey: string;
  series: { key: string; label: string; tone?: Tone }[];
  tipKey?: string;
  height?: number;
}) {
  const { rows } = keySeries(data, series);
  if (rows.every((r) => series.every((_, i) => !Number(r[seriesKey(i)])))) return <EmptyChart />;
  const color = (s: { tone?: Tone }, i: number) =>
    s.tone && s.tone !== "chart" ? TONE_COLOR[s.tone] : chartColor(i);
  const config = Object.fromEntries(
    series.map((s, i) => [seriesKey(i), { label: s.label, color: color(s, i) }]),
  ) satisfies ChartConfig;
  const totals = rows.map((r) => series.reduce((t, _, i) => t + (Number(r[seriesKey(i)]) || 0), 0));
  const axis = valueAxis(totals, "number");
  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
      <BarChart accessibilityLayer data={rows} margin={{ top: 20, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey={xKey}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={24}
          interval={tickEvery(rows.length)}
        />
        <YAxis {...axis} />
        <ChartTooltip
          cursor={false}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const row = payload[0]!.payload as Row;
            const total = series.reduce((t, _, i) => t + (Number(row[seriesKey(i)]) || 0), 0);
            return (
              <div className="border-border/50 bg-background grid min-w-40 gap-2 rounded-lg border px-2.5 py-1.5 text-xs shadow-xl">
                {headerLabel((tipKey && row[tipKey]) || row[xKey])}
                {series.map((s, i) => (
                  <div key={seriesKey(i)} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <div className="h-2.5 w-2.5 shrink-0 rounded-xs" style={{ background: color(s, i) }} />
                      <span className="text-muted-foreground">{s.label}</span>
                    </div>
                    <span className="text-foreground font-semibold tabular-nums">
                      {(Number(row[seriesKey(i)]) || 0).toLocaleString()}
                    </span>
                  </div>
                ))}
                <div className="border-border/50 flex items-center justify-between gap-2 border-t pt-1.5">
                  <span className="text-muted-foreground">Total</span>
                  <span className="text-foreground font-semibold tabular-nums">{total.toLocaleString()}</span>
                </div>
              </div>
            );
          }}
        />
        {series.map((s, i) => (
          <Bar
            key={seriesKey(i)}
            dataKey={seriesKey(i)}
            name={s.label}
            stackId="a"
            fill={color(s, i)}
            stroke="var(--card)"
            strokeWidth={2}
            maxBarSize={32}
          />
        ))}
        <ChartLegend content={<ChartLegendContent />} />
      </BarChart>
    </ChartContainer>
  );
}
