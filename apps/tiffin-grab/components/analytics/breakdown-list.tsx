"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { cn } from "@foundry/ui/cn";
import { ListPagination } from "@/components/ds";
import { ChartEmpty } from "@/components/analytics/chart-boundary";

/** Compact page size for analytics cards (DataTable defaults to 25). */
const PAGE_SIZE = 10;

export type BreakdownRow = {
  label: string;
  n: number;
  href?: string;
  /** Secondary text shown under the label (e.g. the parent category). */
  meta?: string;
  /** Replaces the raw count on the right, for example a money amount. The bar still uses `n`. */
  aside?: string;
  /** Marks the currently drilled-into row. */
  active?: boolean;
  /** Dimmed styling for rows that are shown but excluded from the metrics. */
  muted?: boolean;
};

/**
 * A compact "label, share, count" list used in place of a chart wherever every
 * row should be clickable — the share bar reads at a glance and each row links
 * to the tickets behind it, which a chart's slice cannot do without a client
 * event handler on every segment.
 *
 * Long lists page locally (default 10) so analytics cards stay short. Bar
 * widths stay relative to the full list (or `total`), not the current page.
 */
export function BreakdownList({
  rows,
  emptyLabel = "Nothing in this range.",
  total,
  footer,
  pageSize = PAGE_SIZE,
}: {
  rows: BreakdownRow[];
  emptyLabel?: string;
  /** Share denominator; defaults to the largest row so bars stay comparable. */
  total?: number;
  /** Sticky row under the page (e.g. a Total line). Not paginated. */
  footer?: ReactNode;
  pageSize?: number;
}) {
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(pageSize);
  const visible = rows.filter((r) => r.n > 0 || r.active);

  // New filter range → new rows; drop back to the first page.
  useEffect(() => {
    setPage(0);
  }, [visible.length, visible[0]?.label, visible[0]?.meta]);

  if (visible.length === 0) {
    return <ChartEmpty message={emptyLabel} />;
  }
  // Global max so bars stay comparable when the user pages.
  const denom = total ?? Math.max(...visible.map((r) => r.n), 1);
  const pageCount = Math.max(1, Math.ceil(visible.length / size));
  const safePage = Math.min(Math.max(0, page), pageCount - 1);
  const pageRows = visible.slice(safePage * size, (safePage + 1) * size);

  return (
    <div className="flex flex-col gap-1">
      <ul className="divide-border/60 -my-1 divide-y">
        {pageRows.map((r) => {
          const pct = denom > 0 ? Math.round((r.n / denom) * 100) : 0;
          const body = (
            <div className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className={cn("truncate text-sm", r.muted && "text-muted-foreground")}>{r.label}</span>
                  <span className="text-sm font-semibold tabular-nums">{r.aside ?? r.n}</span>
                </div>
                {r.meta ? <p className="text-muted-foreground truncate text-xs">{r.meta}</p> : null}
                <div className="bg-muted mt-1.5 h-1.5 w-full overflow-hidden rounded-full">
                  <div
                    className={cn("h-full rounded-full", r.muted ? "bg-muted-foreground/40" : "bg-primary")}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            </div>
          );
          return (
            <li key={`${r.label}-${r.meta ?? ""}`}>
              {r.href ? (
                <Link
                  href={r.href}
                  className={cn(
                    "hover:bg-muted/50 -mx-2 block rounded-md px-2 transition-colors",
                    r.active && "bg-muted/60",
                  )}
                >
                  {body}
                </Link>
              ) : (
                body
              )}
            </li>
          );
        })}
        {footer ? <li className="pt-2">{footer}</li> : null}
      </ul>
      {visible.length > pageSize ? (
        <ListPagination
          page={safePage}
          size={size}
          total={visible.length}
          onChange={(next) => {
            setPage(next.page);
            setSize(next.size);
          }}
        />
      ) : null}
    </div>
  );
}
