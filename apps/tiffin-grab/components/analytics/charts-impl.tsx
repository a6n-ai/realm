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
  Pie,
  PieChart,
  Treemap,
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
import type { TreemapNode } from "recharts";
import {
  Tooltip,
  TooltipProvider,
  TooltipTrigger,
} from "@foundry/ui/tooltip";
import { cn } from "@foundry/ui/cn";
import { ChartTip } from "@/components/analytics/chart-tip";
import type { TreemapGroup } from "@/lib/analytics/size-treemap";
import { ChartEmpty } from "@/components/analytics/chart-boundary";
import { keySeries, seriesKey } from "@/components/analytics/series-keys";
import {
  axisTicks,
  calendarWeeks,
  chartColor,
  foldParts,
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
  positionalConfig,
  rankedHeight,
  signedTicks,
  TONE_COLOR,
  tickEvery,
  topWithOther,
  trailingAverage,
  fitLabel,
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

/** c-chart-13: gradient area; at day grain (`average`) a light area plus a bold trailing 7-day line. */
export function TrendLineChart({
  data,
  xKey,
  yKey,
  label = "Value",
  format = "number",
  height = 240,
  average = false,
  tipKey,
}: {
  data: Row[];
  xKey: string;
  yKey: string;
  /** Daily grain: a light area of the values plus a bold trailing 7-day average line. */
  average?: boolean;
  /** Row field with the long date shown in the tooltip heading ("Sat, Oct 3"). */
  tipKey?: string;
  /** Series name (tooltip). */
  label?: string;
  format?: ValueFormat;
  height?: number;
}) {
  const uid = useId().replace(/:/g, "");
  if (data.length === 0) return <EmptyChart />;
  const lines = [{ key: yKey, label }];
  if (average)
    return <AverageTrend data={data} xKey={xKey} yKey={yKey} label={label} format={format} height={height} tipKey={tipKey} />;
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

/** Y-axis width (120) minus its tick margin (10): text is right-aligned, so overflow clips the start. */
const RANKED_LABEL_PX = 110;

/** One-line, truncated category tick (Recharts' default tick wraps at the axis width). */
function SingleLineTick({ x, y, payload }: { x?: number; y?: number; payload?: { value: unknown } }) {
  return (
    <text x={x} y={y} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-xs">
      <title>{String(payload?.value ?? "")}</title>
      {fitLabel(payload?.value, RANKED_LABEL_PX)}
    </text>
  );
}

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
  if (ranked.length === 0) return <EmptyChart />;
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
          // Currency labels ("$1,802.35") need more room than counts, or the longest bar's label clips.
          margin={{ top: 0, bottom: 0, left: -10, right: format === "currency" ? 84 : 48 }}
          barCategoryGap="30%"
        >
          <YAxis
            type="category"
            dataKey={xKey}
            tickLine={false}
            tickMargin={10}
            axisLine={false}
            width={120}
            tick={<SingleLineTick />}
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

function donutCentre(total: number, format: ValueFormat, caption: string, label?: string) {
  const text =
    label ??
    (format === "currency"
      ? moneyTick(total)
      : total.toLocaleString());
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
                <ChartTip>{text}</ChartTip>
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
export type ListPart = {
  label: string;
  value: number;
  /** Replaces the formatted value on the right. */
  aside?: string;
  meta?: string;
  /** Hover detail, for example the parts a folded row is made of. */
  tip?: ReactNode;
};

export function PartsDonut({
  parts,
  listParts,
  emptyLabel,
  format = "number",
  max = 6,
  caption = "Total",
  label,
  footnote,
}: {
  parts: Part[];
  /** List rows independent of the slices. A row takes the swatch of the slice with its label, else the Other slice's. */
  listParts?: ListPart[];
  emptyLabel?: string;
  format?: ValueFormat;
  max?: number;
  caption?: string;
  /** Centre figure instead of the total, e.g. "62%" with caption "collected". */
  label?: string;
  footnote?: ReactNode;
}) {
  const router = useRouter();
  const folded = foldParts(parts, max);
  if (folded.length === 0) return emptyLabel ? <ChartEmpty message={emptyLabel} /> : <EmptyChart />;
  const total = folded.reduce((s, p) => s + p.value, 0);
  const config = Object.fromEntries(folded.map((p, i) => [`p${i}`, { label: p.label }])) satisfies ChartConfig;
  const otherColor = folded.find((p) => p.label === "Other")?.color ?? TONE_COLOR.muted;
  const listTotal = listParts?.reduce((t, p) => t + p.value, 0) ?? 0;
  const listRows = listParts
    ? listParts.map((p) => ({
        label: p.label,
        meta: p.meta,
        tip: p.tip,
        href: undefined as string | undefined,
        color: folded.find((f) => f.label === p.label)?.color ?? otherColor,
        text: p.aside ?? formatValue(p.value, format),
        share: listTotal > 0 ? Math.round((p.value / listTotal) * 100) : 0,
      }))
    : folded.map((p) => ({ label: p.label, meta: undefined, tip: undefined, href: p.href, color: p.color, text: formatValue(p.value, format), share: p.share }));
  return (
    <div className="flex h-full flex-col items-center gap-4">
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
            {donutCentre(total, format, caption, label)}
          </Pie>
        </PieChart>
      </ChartContainer>
      <div className="flex w-full min-w-0 flex-1 flex-col">
      <ul className="divide-border/60 w-full divide-y">
        {listRows.map((p, i) => {
          const row = (
            <>
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: p.color }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{p.label}</span>
                {p.meta ? <span className="text-muted-foreground block truncate text-xs">{p.meta}</span> : null}
              </span>
              <span className="font-semibold tabular-nums">{p.text}</span>
              <span className="text-muted-foreground w-10 text-right text-xs tabular-nums">{fmtPct(p.share)}</span>
            </>
          );
          const cls = "flex items-center gap-2 py-2 text-sm";
          return (
            <li key={`${p.label}-${i}`}>
              {p.tip ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div tabIndex={0} className={cn(cls, "focus-visible:ring-ring/50 cursor-default rounded-sm outline-none focus-visible:ring-2")}>
                        {row}
                      </div>
                    </TooltipTrigger>
                    <ChartTip side="left" className="max-w-xs">
                      {p.tip}
                    </ChartTip>
                  </Tooltip>
                </TooltipProvider>
              ) : p.href ? (
                <Link
                  href={p.href}
                  className="hover:bg-muted/50 focus-visible:ring-ring/50 -mx-2 flex items-center gap-2 rounded-md px-2 py-2 text-sm outline-none transition-colors focus-visible:ring-2"
                >
                  {row}
                </Link>
              ) : (
                <div className={cls}>{row}</div>
              )}
            </li>
          );
        })}
      </ul>
      {footnote ? <div className="text-muted-foreground pt-2 text-xs">{footnote}</div> : null}
      </div>
    </div>
  );
}

/** Lowest a size shade goes: the plan colour mixed this far toward the card. */
const SHADE_FLOOR = 55;

const TREEMAP_PAD = 6;

/** Light text on dark fills, dark on light, from the fill's own lightness; the class is the fallback for browsers without relative colours. */
const onFill = (fill: string) => `oklch(from ${fill} clamp(0.15, calc((0.62 - l) * 100), 0.98) 0 0)`;

function TreemapCell({ node, format }: { node: TreemapNode; format: ValueFormat }) {
  if (node.depth !== 2) return <g />;
  const { x, y, width, height, name, value } = node;
  const fill = String(node.color);
  const inner = width - TREEMAP_PAD * 2;
  // Name and value together need about two text-xs lines; smaller boxes stay unlabelled (the tooltip has it).
  const room = inner >= 48 && height >= 2 * 16 + TREEMAP_PAD * 2;
  const textClass = "fill-foreground text-xs";
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={fill} stroke="var(--card)" strokeWidth={2} />
      {room ? (
        <>
          <text x={x + TREEMAP_PAD} y={y + TREEMAP_PAD} dominantBaseline="hanging" className={`${textClass} font-medium`} style={{ fill: onFill(fill) }}>
            {fitLabel(name, inner)}
          </text>
          <text x={x + TREEMAP_PAD} y={y + TREEMAP_PAD + 16} dominantBaseline="hanging" className={`${textClass} tabular-nums`} style={{ fill: onFill(fill) }}>
            {formatValue(value, format)}
          </text>
        </>
      ) : null}
    </g>
  );
}

/** Plan groups in categorical colours, each plan's sizes in shades of it (largest = full colour). Boxes truncate; the tooltip has the full name. */
export function TreemapChart({
  data,
  format = "number",
  height = 320,
}: {
  data: TreemapGroup[];
  format?: ValueFormat;
  height?: number;
}) {
  if (data.length === 0) return <EmptyChart />;
  const total = data.reduce((s, g) => s + g.children.reduce((t, c) => t + c.value, 0), 0);
  const nodes = data.map((g, gi) => ({
    name: g.name,
    plan: g.name,
    children: g.children.map((c, ci) => ({
      ...c,
      plan: g.name,
      color: `color-mix(in oklch, ${chartColor(gi)} ${Math.round(100 - ((100 - SHADE_FLOOR) * ci) / Math.max(1, g.children.length - 1))}%, var(--card))`,
    })),
  }));
  const config = Object.fromEntries(data.map((g, i) => [`p${i}`, { label: g.name, color: chartColor(i) }])) satisfies ChartConfig;
  return (
    <div className="flex flex-col gap-3">
      <ChartContainer config={config} className="w-full" style={{ height }}>
        <Treemap
          data={nodes}
          dataKey="value"
          nameKey="name"
          isAnimationActive={false}
          content={(node) => <TreemapCell node={node} format={format} />}
        >
          <ChartTooltip
            content={
              <ChartTooltipContent
                hideLabel
                className="min-w-40 gap-2.5"
                formatter={(value, name, item) => (
                  <div className="flex w-full flex-col gap-0.5">
                    <span className="font-medium">{name}</span>
                    <span className="text-muted-foreground">{item?.payload?.plan}</span>
                    <span className="text-foreground font-semibold tabular-nums">
                      {formatValue(value, format)} · {fmtPct(total > 0 ? Math.round((Number(value) / total) * 100) : 0)}
                    </span>
                  </div>
                )}
              />
            }
          />
        </Treemap>
      </ChartContainer>
      <ul className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {data.map((g, i) => (
          <li key={`${g.name}-${i}`} className="flex items-center gap-1.5">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: chartColor(i) }} />
            {g.name}
          </li>
        ))}
      </ul>
    </div>
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
                            background: chartColor(0),
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
                    <ChartTip>{text}</ChartTip>
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
                  background: chartColor(0),
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
  // Days after today are not cells (blank), so they never read as a $0 day.
  const weeks = calendarWeeks(from, today && today < to ? today : to);
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
                        <span aria-hidden className="absolute inset-0" style={{ background: chartColor(0), opacity: heatOpacity(b) }} />
                        <span className={cn("relative", b === 0 ? "text-muted-foreground" : heatIsDense(b) ? "text-background font-medium" : "text-foreground font-medium")}>
                          {v > 0 ? cellText(v) : null}
                        </span>
                      </div>
                    </TooltipTrigger>
                    <ChartTip>
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
                    </ChartTip>
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
              <span key={i} className="flex-1" style={{ background: chartColor(0), opacity: heatOpacity(i + 1) }} />
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
    return { ...r, s0, fill: s0 < 0 ? "var(--chart-bad)" : "var(--chart-good)" };
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

