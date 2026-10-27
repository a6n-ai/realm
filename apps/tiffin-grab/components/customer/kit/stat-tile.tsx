import type { ReactNode } from "react";
import { cn, FONT } from "./cn";

/**
 * A number with its label: icon and label share the top row, then the value, then the hint. `bare` drops the
 * tile's own surface so several can sit in one card (StatGroup).
 */
export function StatTile({ label, value, unit, worth, hint, icon, bare, className }: { label: string; value: ReactNode; unit?: string; /** Money value beside the number ("$2.00"), so it never adds a line. */ worth?: string | null; hint?: string; icon?: ReactNode; bare?: boolean; className?: string }) {
  return (
    <div className={cn(FONT, "flex h-full min-w-0 flex-col gap-2", bare ? "p-4" : "c-surface rounded-[20px] bg-[var(--card)] p-4", className)}>
      <p className="flex min-w-0 items-center gap-2 text-[13px] font-semibold text-[var(--muted-foreground)]">
        {icon}
        <span className="truncate">{label}</span>
      </p>
      <p className="mt-1 leading-none">
        <span className="c-stat">{value}</span>
        {unit && <span className="ml-1 text-sm font-medium text-[var(--muted-foreground)]">{unit}</span>}
        {worth && <span className="ml-1.5 text-sm font-semibold tabular-nums text-[var(--s-delivered,#10b981)]">· {worth}</span>}
      </p>
      {hint && <p className="c-caption">{hint}</p>}
    </div>
  );
}

/** Stats side by side in one card, split by a hairline, so a pair reads as one summary without dead space. */
export function StatGroup({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn(FONT, "c-surface grid auto-cols-fr grid-flow-col divide-x divide-[var(--border)] overflow-hidden rounded-[20px] bg-[var(--card)]", className)}>{children}</div>;
}
