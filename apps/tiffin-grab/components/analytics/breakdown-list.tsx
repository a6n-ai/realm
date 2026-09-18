import Link from "next/link";
import { cn } from "@foundry/ui/cn";

export type BreakdownRow = {
  label: string;
  n: number;
  href?: string;
  /** Secondary text shown under the label (e.g. the parent category). */
  meta?: string;
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
 */
export function BreakdownList({
  rows,
  emptyLabel = "Nothing in this range.",
  total,
}: {
  rows: BreakdownRow[];
  emptyLabel?: string;
  /** Share denominator; defaults to the largest row so bars stay comparable. */
  total?: number;
}) {
  const visible = rows.filter((r) => r.n > 0 || r.active);
  if (visible.length === 0) {
    return <p className="text-muted-foreground py-6 text-center text-sm">{emptyLabel}</p>;
  }
  const denom = total ?? Math.max(...visible.map((r) => r.n), 1);

  return (
    <ul className="divide-border/60 -my-1 divide-y">
      {visible.map((r) => {
        const pct = denom > 0 ? Math.round((r.n / denom) * 100) : 0;
        const body = (
          <div className="flex items-center gap-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className={cn("truncate text-sm", r.muted && "text-muted-foreground")}>{r.label}</span>
                <span className="nums text-sm font-semibold tabular-nums">{r.n}</span>
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
    </ul>
  );
}
