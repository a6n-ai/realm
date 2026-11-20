import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";
import { Card } from "@foundry/ui/card";
import { Skeleton } from "@foundry/ui/skeleton";
import { Badge } from "@/components/reui/badge";
import { InfoTip } from "@/components/dashboard/analytics/chart-tip";
import { HoverHint } from "@/components/ds/hover-hint";
import { cn } from "@foundry/ui/cn";
import { isValidAnalyticsCardCount } from "@/lib/analytics/card-rules";

/**
 * Interactive KPI contract (TiffinGrab standard):
 * - Set `href` whenever the figure is backed by retrievable rows whose listing
 *   filters can reproduce the same count (same query definition + date/scope).
 * - Omit `href` only for decorative or non-listable metrics (rates, composites).
 * - Prefer navigating to an existing filtered list (search/sort/pagination/CSV
 *   already live there) over a one-off drawer.
 */
export type StatCardItem = {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  hint?: string;
  /** Colors the figure for a bare good/bad number with no trend, e.g. a balance still due. */
  tone?: "ok" | "bad" | "warn";
  /** Makes the whole cell a link to the rows behind the number. */
  href?: string;
  /** Short state pill in the icon slot. */
  badge?: string;
  /** @deprecated The badge now sits behind the info icon, which has no tone. */
  badgeTone?: "neutral" | "ok" | "warn" | "brand" | "primary";
  /** A second fact under the hint, usually a `StatFootnote`. */
  footer?: ReactNode;
  /** A name (a dish title) should not use the figure size. */
  valueSize?: "label";
  /** Change vs the previous period. `good` says which way is good news (more cancellations is not). */
  delta?: { now: number; before: number; good: "up" | "down" };
  /** What the delta compares against, read as "vs previous 7 days". */
  compareLabel?: string;
  /** A second line under the label, e.g. "Last 7 days". */
  period?: string;
  /** Colour of the dot before the label, normally a `--chart-*` token. Defaults to the chart palette by position. */
  color?: string;
};

const CHART_PALETTE = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

// Static class maps: Tailwind only sees literal class names.
const XL_COLS = ["", "xl:grid-cols-1", "xl:grid-cols-2", "xl:grid-cols-3", "xl:grid-cols-4", "xl:grid-cols-5"];
const MD_COLS = ["", "md:grid-cols-1", "md:grid-cols-2", "md:grid-cols-3"];
const SPAN = ["", "col-span-1", "col-span-2"];
const MD_SPAN = ["", "md:col-span-1", "md:col-span-2", "md:col-span-3"];
const XL_SPAN = ["", "xl:col-span-1", "xl:col-span-2", "xl:col-span-3", "xl:col-span-4", "xl:col-span-5"];

/** Columns that divide the count, so no row ends in an empty slot; a remainder (7 cells) is absorbed by the last cell. */
export function statGrid(n: number, preferred: 3 | 4 | 5) {
  const pick = (options: number[]) => options.find((c) => c <= n && n % c === 0) ?? Math.min(n, options[0]!);
  const xl = pick([preferred, 5, 4, 3, 2]);
  const md = pick([3, 2]);
  const base = Math.min(n, 2);
  const span = (cols: number) => (n % cols === 0 ? 1 : cols - (n % cols) + 1);
  return {
    grid: cn(base === 1 ? "grid-cols-1" : "grid-cols-2", MD_COLS[md], XL_COLS[xl]),
    last: cn(SPAN[span(base)], MD_SPAN[span(md)], XL_SPAN[span(xl)]),
  };
}

const CELL = "bg-card flex h-full min-w-0 flex-col gap-4 p-4 sm:p-5";

/** Second fact row under a card's hint, for a second fact such as a rate or a total. */
export function StatFootnote({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      {children}
    </div>
  );
}

// ReUI c-card-15 (stat with trend), minus its overflow menu: these cards have no actions.
// Dashboard stat rows use this instead of the @foundry/design-system StatGrid.
export function StatCards({
  items,
  cols = 5,
}: {
  items: StatCardItem[];
  cols?: 3 | 4 | 5;
}) {
  if (!items.length) return null;
  const { grid, last } = statGrid(items.length, cols);
  return (
    <Card className="py-0 overflow-hidden">
      {/* gap-px over a border-coloured grid draws the dividers at every column count. */}
      <div data-slot="stat-grid" className={cn("bg-border grid gap-px", grid)}>
        {items.map((item, i) => (
          <StatCell
            key={item.label}
            {...item}
            color={item.color ?? CHART_PALETTE[i % CHART_PALETTE.length]!}
            className={i === items.length - 1 ? last : undefined}
          />
        ))}
      </div>
    </Card>
  );
}

function StatCell({
  label,
  value,
  icon: Icon,
  hint,
  tone,
  delta,
  compareLabel,
  href,
  badge,
  footer,
  valueSize,
  period,
  color,
  className,
}: StatCardItem & { color: string; className?: string }) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex min-w-0 items-center gap-2">
            <span data-slot="stat-dot" aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: color }} />
            <h3 className="text-muted-foreground min-w-0 truncate text-sm font-medium">{label}</h3>
          </div>
          {period ? <span className="text-muted-foreground text-footnote">{period}</span> : null}
        </div>
        {badge ? (
          <InfoTip inLink={Boolean(href)}>{badge}</InfoTip>
        ) : Icon ? (
          <Icon className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
        ) : null}
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-col gap-0.5">
          <span
            className={cn(
              // Geist heading-24, measured on vercel.com: sans, not mono.
              valueSize === "label" ? "text-lg font-medium tracking-tight" : "text-2xl leading-8 font-semibold tracking-[-0.96px] tabular-nums",
              tone === "ok"
                ? "text-success-foreground dark:text-success"
                : tone === "bad"
                  ? "text-destructive-foreground dark:text-destructive"
                  : tone === "warn"
                    ? "text-warning-foreground dark:text-warning"
                    : "text-foreground",
            )}
          >
            {value}
          </span>
          {hint ? <div className="text-muted-foreground text-footnote">{hint}</div> : null}
        </div>
        {delta ? <DeltaLine {...delta} compareLabel={compareLabel} /> : null}
        {footer}
      </div>
    </>
  );
  return href ? (
    <Link
      href={href}
      data-slot="stat-cell"
      className={cn(CELL, "outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring", className)}
    >
      {body}
    </Link>
  ) : (
    <div data-slot="stat-cell" className={cn(CELL, className)}>
      {body}
    </div>
  );
}

/** Analytics cards always carry a qualifier (behind the info icon) and the hint. */
export type AnalyticsStatCardItem = StatCardItem & { hint: string; badge: string };

/** Analytics tabs: 4 or 8 cards in rows of 4. A wrong count fails loudly outside production. */
export function AnalyticsStatCards({ items }: { items: AnalyticsStatCardItem[] }) {
  if (process.env.NODE_ENV !== "production" && !isValidAnalyticsCardCount(items.length)) {
    throw new Error(`Analytics tabs show 4 or 8 stat cards, got ${items.length}`);
  }
  return <StatCards cols={4} items={items} />;
}

/** Loading twin of AnalyticsStatCards: one or two rows of four. */
export function AnalyticsStatCardsSkeleton({ rows }: { rows: 1 | 2 }) {
  return <StatCardsSkeleton count={rows * 4} cols={4} />;
}

/** "↑ 12% vs previous 7 days": a delta never stands alone, it always names what it compares against. */
function DeltaLine({
  now,
  before,
  good,
  compareLabel = "previous period",
}: {
  now: number;
  before: number;
  good: "up" | "down";
  compareLabel?: string;
}) {
  const vs = <span className="text-muted-foreground text-footnote">vs {compareLabel}</span>;
  // A zero before is real data, but a percent of zero is undefined: show the absolute change instead.
  const pct = before === 0 ? null : Math.round(((now - before) / before) * 100);
  if (now === before || pct === 0) {
    return <div className="flex items-center gap-1.5"><Badge variant="secondary">No change</Badge>{vs}</div>;
  }
  const up = now > before;
  const Arrow = up ? ArrowUpIcon : ArrowDownIcon;
  return (
    <HoverHint text={`${now.toLocaleString()} now · ${before.toLocaleString()} before`}>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      <Badge variant={up === (good === "up") ? "success-light" : "destructive-light"}>
        <Arrow aria-hidden="true" />
        <span className="tabular-nums">{pct == null ? Math.abs(now - before).toLocaleString() : `${Math.abs(pct)}%`}</span>
        <span className="sr-only">{up ? "up" : "down"}</span>
      </Badge>
      {vs}
      </div>
    </HoverHint>
  );
}

export function StatCardsSkeleton({
  count,
  cols = 5,
}: {
  count: number;
  cols?: 3 | 4 | 5;
}) {
  const { grid, last } = statGrid(count, cols);
  return (
    <Card className="py-0 overflow-hidden">
      <div data-slot="stat-grid" className={cn("bg-border grid gap-px", grid)}>
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} data-slot="stat-cell" className={cn(CELL, i === count - 1 && last)}>
            <Skeleton className="h-4 w-24" />
            <div className="mt-auto flex flex-col gap-2.5">
              <Skeleton className="h-7 w-16" />
              <Skeleton className="h-3 w-40" />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
