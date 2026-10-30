import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@foundry/ui/cn";
import {
  AnalyticsBadge,
  AnalyticsEyebrow,
  AnalyticsPanel,
} from "@/components/analytics/analytics-panel";

export type MetricTile = {
  label: string;
  value: string | number;
  hint?: string;
  href?: string;
  tone?: "default" | "warn" | "bad" | "ok";
  /** Long names (a dish title) should not use the figure size. */
  valueSize?: "metric" | "label";
  badge?: string;
  badgeTone?: "neutral" | "ok" | "warn" | "brand" | "primary";
  footer?: ReactNode;
};

/** Soft bar under a metric, for a second fact such as a rate or a total. */
export function MetricFootnote({ children }: { children: ReactNode }) {
  return (
    <div className="bg-muted/60 flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs">
      {children}
    </div>
  );
}

const VALUE_TONE: Record<NonNullable<MetricTile["tone"]>, string> = {
  default: "text-foreground",
  warn: "text-warn",
  bad: "text-bad",
  ok: "text-[var(--accent-badge)]",
};

/**
 * Headline metrics as linked tiles.
 *
 * Foundry's StatGrid has no href, and a metric the reader cannot open is a dead
 * end — "12 open complaints" should lead to those twelve. Kept app-local rather
 * than widening the shared component for one consumer.
 */
export function MetricTiles({ items, cols = 3 }: { items: MetricTile[]; cols?: 3 | 4 }) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4",
        cols === 4 ? "lg:grid-cols-4" : "md:grid-cols-3",
      )}
    >
      {items.map((it) => {
        const body = (
          <AnalyticsPanel
            padding="lg"
            className="hover:shadow-[0_2px_12px_rgba(0,0,0,0.06)] flex h-full flex-col justify-between transition-shadow"
          >
            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <AnalyticsEyebrow>{it.label}</AnalyticsEyebrow>
                {it.badge ? <AnalyticsBadge tone={it.badgeTone ?? "neutral"}>{it.badge}</AnalyticsBadge> : null}
              </div>
              <p
                className={cn(
                  it.valueSize === "label"
                    ? "text-xl leading-7 font-semibold tracking-tight text-balance sm:text-2xl sm:leading-8"
                    : "nums text-[1.75rem] leading-9 font-bold tracking-tight tabular-nums sm:text-[2rem] sm:leading-10",
                  VALUE_TONE[it.tone ?? "default"],
                )}
              >
                {it.value}
              </p>
              {it.hint ? (
                <p className="text-muted-foreground mt-1.5 text-xs text-pretty">{it.hint}</p>
              ) : null}
            </div>
            {it.footer ? <div className="mt-4">{it.footer}</div> : null}
          </AnalyticsPanel>
        );
        return it.href ? (
          <Link
            key={it.label}
            href={it.href}
            className="hover-lift focus-visible:ring-ring block h-full rounded-xl outline-none transition-transform focus-visible:ring-2"
          >
            {body}
          </Link>
        ) : (
          <div key={it.label} className="h-full">
            {body}
          </div>
        );
      })}
    </div>
  );
}
