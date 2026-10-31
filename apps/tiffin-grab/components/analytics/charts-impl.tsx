"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useId,
  useState,
  type ComponentProps,
  type ReactNode,
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
  XAxis,
  YAxis,
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
  calendarWeeks,
  chartColor as tokenColor,
  foldParts,
  funnelStages,
  heatBucket,
  heatOpacity,
  HEAT_STEPS,
  heatIsDense,
  moneyTick,
  DONUT_PX,
  DONUT_INNER,
  DONUT_OUTER,
  DONUT_VALUE_CLASS,
  DONUT_CAPTION_CLASS,
  DONUT_VALUE_TEXT_CLASS,
  DONUT_CAPTION_TEXT_CLASS,
  positionalConfig,
  rankedHeight,
  signedTicks,
  TONE_COLOR,
  tickEvery,
  topWithOther,
  trailingAverage,
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
  average = false,
  tipKey,
}: {
  data: Row[];
  xKey: string;
  yKey?: string;
  /** Single `yKey` only, daily grain: a light area of the values plus a bold trailing 7-day average line. */
  average?: boolean;
  /** Row field with the long date shown in the tooltip heading ("Sat, Oct 3"). */
  tipKey?: string;
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
  if (average && yKey && !series)
    return <AverageTrend data={data} xKey={xKey} yKey={yKey} label={label} format={format} height={height} tipKey={tipKey} />;
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

/** Daily values as a light area, their trailing 7-day mean as a bold line. Keys are positional (s0, s1). */
function AverageTrend({
  data,
  xKey,
  yKey,
  label,
  format,
  height,
  tipKey,
}: {
  data: Row[];
  xKey: string;
  yKey: string;
  label: string;
  format: ValueFormat;
  height: number;
  tipKey?: string;
}) {
  const values = data.map((r) => Number(r[yKey]) || 0);
  if (values.every((v) => !v)) return <EmptyChart />;
  const avg = trailingAverage(values);
  const rows = data.map((r, i) => ({ ...r, s0: values[i]!, s1: Math.round(avg[i]! * 100) / 100 }));
  const config = {
    s0: { label, color: chartColor(0) },
    s1: { label: "7-day average", color: chartColor(0) },
  } satisfies ChartConfig;
  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
      <AreaChart accessibilityLayer data={rows} margin={{ top: 20, right: 12, bottom: 12, left: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey={xKey} tickLine={false} axisLine={false} tickMargin={10} minTickGap={24} interval={tickEvery(rows.length)} />
        <YAxis {...valueAxis(values, format)} />
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
        <Area dataKey="s0" name={label} type="monotone" fill={chartColor(0)} fillOpacity={0.18} stroke={chartColor(0)} strokeOpacity={0.35} strokeWidth={1} />
        <Area dataKey="s1" name="7-day average" type="monotone" fill="none" stroke={chartColor(0)} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
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
  activeKey,
  mutedKey,
}: {
  data: Row[];
  xKey: string;
  yKey: string;
  label?: string;
  format?: ValueFormat;
  /** Horizontal charts only: row field holding a URL; clicking that bar navigates there. */
  hrefKey?: string;
  /** Horizontal charts only: row field that is 1 for the picked row; the others dim. */
  activeKey?: string;
  /** Horizontal charts only: row field that is 1 for rows drawn in the muted tone. */
  mutedKey?: string;
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
    <div className="relative">
      <ChartContainer
        config={config}
        className="aspect-auto w-full"
        style={{ height: rankedHeight(ranked.length) }}
      >
        <BarChart
          accessibilityLayer
          data={ranked}
          layout="vertical"
          margin={{ top: 0, bottom: 0, left: -10, right: 48 }}
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
            {ranked.map((r, i) => (
              <Cell
                key={i}
                fill={r[mutedKey ?? ""] ? "var(--muted-foreground)" : chartColor(0)}
                fillOpacity={ranked.some((x) => x[activeKey ?? ""]) && !r[activeKey ?? ""] ? 0.45 : 1}
              />
            ))}
            <LabelList
              dataKey={yKey}
              position="right"
              className="fill-foreground text-xs font-medium tabular-nums"
              formatter={(v: unknown) => formatValue(v, format)}
            />
          </Bar>
        </BarChart>
      </ChartContainer>
      {hrefKey ? (
        // The bars are mouse targets; these give each linked row a keyboard stop. Rows line up with the
        // chart's category bands (zero vertical margin; Recharts splits the plot evenly by row count) and never take pointer events.
        <nav aria-label={`${label} links`} className="pointer-events-none absolute inset-0">
          {ranked.map((r, i) =>
            typeof r[hrefKey] === "string" ? (
              <Link
                key={i}
                href={r[hrefKey]}
                aria-label={`${r[xKey]}: ${formatValue(r[yKey], format)}`}
                className="focus-visible:ring-ring/60 absolute inset-x-0 rounded-sm outline-none focus-visible:ring-2"
                style={{ top: `${(i / ranked.length) * 100}%`, height: `${100 / ranked.length}%` }}
              />
            ) : null,
          )}
        </nav>
      ) : null}
    </div>
  );
}

function donutCentre(total: number, format: ValueFormat, caption: string) {
  const text =
    format === "currency"
      ? moneyTick(total)
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
                className={DONUT_VALUE_CLASS}
              >
                {text}
              </tspan>
              <tspan
                x={viewBox.cx}
                y={(viewBox.cy || 0) + 22}
                className={DONUT_CAPTION_CLASS}
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

/** c-chart-25: one radial bar on a 0-100 track with the % in the centre. Values are percentages. */
export function RadialRateChart({
  data,
  nameKey,
  valueKey,
  caption,
  height = DONUT_PX,
}: {
  data: Row[];
  nameKey: string;
  valueKey: string;
  /** Small word under the figure: "collected", "converted", "skipped". */
  caption?: string;
  height?: number;
}) {
  if (data.length === 0) return <EmptyChart />;
  const rows = data.map((r, i): Row => ({ ...r, fill: chartColor(i) }));
  const config = Object.fromEntries(
    rows.map((r) => [String(r[nameKey]), { label: String(r[nameKey] ?? "") }]),
  ) satisfies ChartConfig;
  return (
    <div className="relative mx-auto aspect-square" style={{ height }}>
      <ChartContainer config={config} className="aspect-square h-full w-full">
        <RadialBarChart
          accessibilityLayer
          data={rows}
          innerRadius={DONUT_INNER}
          outerRadius={DONUT_OUTER}
          startAngle={90}
          endAngle={-270}
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
          <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
          <RadialBar dataKey={valueKey} background cornerRadius={10} />
        </RadialBarChart>
      </ChartContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className={DONUT_VALUE_TEXT_CLASS}>{Number(rows[0]![valueKey])}%</span>
        {caption ? <span className={DONUT_CAPTION_TEXT_CLASS}>{caption}</span> : null}
      </div>
    </div>
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
                  {p.href ? (
                    <Link
                      href={p.href}
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
                  ) : (
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
                  )}
                </TooltipTrigger>
                <TooltipContent>{text}</TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </TooltipProvider>
      {withList ? (
        <ul className="divide-border/60 divide-y">
          {folded.map((p, i) => {
            const row = (
              <>
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
              </>
            );
            return (
              <li
                key={`${p.label}-${i}`}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              >
                {p.href ? (
                  <Link
                    href={p.href}
                    className="hover:bg-muted/50 -mx-2 flex items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors"
                  >
                    {row}
                  </Link>
                ) : (
                  <div className="flex items-center gap-2 py-2 text-sm">{row}</div>
                )}
              </li>
            );
          })}
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

/**
 * Part-to-whole as a donut with the total in the centre, beside the figures list (name, value, share).
 * The list keeps small parts readable and carries the drill links; slices link too.
 */
export function PartsDonut({
  parts,
  format = "number",
  max = 6,
  caption = "Total",
}: {
  parts: Part[];
  format?: ValueFormat;
  max?: number;
  caption?: string;
}) {
  const router = useRouter();
  const folded = foldParts(parts, max);
  if (folded.length === 0) return <EmptyChart />;
  const total = folded.reduce((s, p) => s + p.value, 0);
  const config = Object.fromEntries(folded.map((p, i) => [`p${i}`, { label: p.label }])) satisfies ChartConfig;
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 sm:flex-row sm:gap-6">
      <ChartContainer config={config} className="aspect-square shrink-0" style={{ height: DONUT_PX }}>
        <PieChart accessibilityLayer>
          <ChartTooltip
            content={<ChartTooltipContent hideLabel className="min-w-40 gap-2.5" formatter={valueFormatter(format)} />}
          />
          <Pie
            data={folded.map((p) => ({ ...p, fill: p.color }))}
            dataKey="value"
            nameKey="label"
            innerRadius={DONUT_INNER}
            outerRadius={DONUT_OUTER}
            paddingAngle={2}
            stroke="var(--background)"
            strokeWidth={2}
            cursor="pointer"
            onClick={(d: { payload?: { href?: string } }) => {
              if (d.payload?.href) router.push(d.payload.href);
            }}
          >
            {folded.map((p, i) => (
              <Cell key={`${p.label}-${i}`} fill={p.color} />
            ))}
            {donutCentre(total, format, caption)}
          </Pie>
        </PieChart>
      </ChartContainer>
      <ul className="divide-border/60 w-full min-w-0 flex-1 divide-y">
        {folded.map((p, i) => {
          const row = (
            <>
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: p.color }} />
              <span className="min-w-0 flex-1 truncate">{p.label}</span>
              <span className="font-semibold tabular-nums">{formatValue(p.value, format)}</span>
              <span className="text-muted-foreground w-10 text-right text-xs tabular-nums">{fmtPct(p.share)}</span>
            </>
          );
          return (
            <li key={`${p.label}-${i}`}>
              {p.href ? (
                <Link
                  href={p.href}
                  className="hover:bg-muted/50 focus-visible:ring-ring/50 -mx-2 flex items-center gap-2 rounded-md px-2 py-2 text-sm outline-none transition-colors focus-visible:ring-2"
                >
                  {row}
                </Link>
              ) : (
                <div className="flex items-center gap-2 py-2 text-sm">{row}</div>
              )}
            </li>
          );
        })}
      </ul>
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

const CAL_DAY = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const CAL_WEEK = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const calDate = (fmt: Intl.DateTimeFormat, iso: string) => fmt.format(new Date(`${iso}T00:00:00Z`));

/** Mon-Sun columns, one row per week. One hue, darker = more; each cell prints its value. */
export function CalendarHeatmap({
  from,
  to,
  today,
  days,
  label = "Value",
  format = "number",
}: {
  /** Calendar days (YYYY-MM-DD) in the app timezone. */
  from: string;
  to: string;
  today?: string;
  /** Sparse: a day with no entry reads 0. `breakdown` lines are listed in the tooltip. */
  days: { date: string; value: number; breakdown?: { label: string; value: number }[] }[];
  label?: string;
  format?: ValueFormat;
}) {
  const weeks = calendarWeeks(from, to);
  const byDate = new Map(days.map((d) => [d.date, d]));
  const inRange = weeks.flat().filter((d): d is string => d !== null);
  const values = inRange.map((d) => byDate.get(d)?.value ?? 0);
  if (weeks.length === 0 || values.every((v) => v <= 0)) return <EmptyChart />;
  const positive = values.filter((v) => v > 0);
  const min = Math.min(...positive);
  const max = Math.max(...positive);
  const cellText = (v: number) => (format === "currency" ? moneyTick(v) : v.toLocaleString());
  const zeroText = format === "currency" ? "$0" : "0";
  return (
    <TooltipProvider>
      <div className="flex flex-col gap-3">
        <div role="table" aria-label={`${label} by day`} className="grid items-stretch gap-0.5 text-sm" style={{ gridTemplateColumns: "minmax(0, auto) repeat(7, minmax(0, 1fr))" }}>
          <div role="row" className="contents">
            <div role="columnheader" />
            {WEEKDAYS.map((d) => (
              <div key={d} role="columnheader" className="text-muted-foreground px-1 pb-1 text-center text-xs">
                {d}
              </div>
            ))}
          </div>
          {weeks.map((week) => (
            <div key={week.find(Boolean) ?? "blank"} role="row" className="contents">
              <div role="rowheader" className="text-muted-foreground flex items-center pr-2 text-xs whitespace-nowrap">
                {calDate(CAL_WEEK, week.find((d): d is string => d !== null)!)}
              </div>
              {week.map((date, i) => {
                if (!date) return <div key={`blank-${i}`} role="cell" aria-hidden className="min-h-10" />;
                const entry = byDate.get(date);
                const v = entry?.value ?? 0;
                const b = heatBucket(v, min, max);
                const parts = (entry?.breakdown ?? []).map((p) => `${p.label} ${formatValue(p.value, format)}`);
                const shown = v > 0 ? formatValue(v, format) : zeroText;
                const text = `${calDate(CAL_DAY, date)}: ${shown}${parts.length ? ` (${parts.join(", ")})` : ""}`;
                return (
                  <Tooltip key={date}>
                    <TooltipTrigger asChild>
                      <div
                        role="cell"
                        tabIndex={v > 0 ? 0 : undefined}
                        aria-label={text}
                        className={cn(
                          "bg-muted/40 focus-visible:ring-ring/50 relative flex min-h-10 items-center justify-center overflow-hidden rounded-sm px-1 py-2 text-xs tabular-nums outline-none focus-visible:ring-2",
                          date === today && "outline-foreground outline-2 -outline-offset-2",
                        )}
                      >
                        <span aria-hidden className="absolute inset-0" style={{ background: tokenColor(0), opacity: heatOpacity(b) }} />
                        <span className={cn("relative", b === 0 ? "text-muted-foreground" : heatIsDense(b) ? "text-background font-medium" : "text-foreground font-medium")}>
                          {v > 0 ? cellText(v) : null}
                        </span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium">{calDate(CAL_DAY, date)}</span>
                        <span>
                          {label}: {shown}
                        </span>
                        {(entry?.breakdown ?? []).map((p) => (
                          <span key={p.label}>
                            {p.label}: {formatValue(p.value, format)}
                          </span>
                        ))}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          ))}
        </div>
        <div className="text-muted-foreground flex items-center gap-2 text-xs" aria-hidden>
          <span>{cellText(0)}</span>
          <div className="flex h-2 flex-1 overflow-hidden rounded-sm">
            {Array.from({ length: HEAT_STEPS }, (_, i) => (
              <span key={i} className="flex-1" style={{ background: tokenColor(0), opacity: heatOpacity(i + 1) }} />
            ))}
          </div>
          <span>{cellText(max)}</span>
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
  const dticks = signedTicks(Math.min(0, ...rows.map((r) => r.s0)), Math.max(0, ...rows.map((r) => r.s0)));
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
          ticks={dticks}
          domain={[dticks[0]!, dticks.at(-1)!]}
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

