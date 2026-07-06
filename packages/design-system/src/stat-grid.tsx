import type { ReactNode } from "react";
import { cn } from "@realm/ui/cn";
import { StatCard } from "./stat-card";
import { StatBar, type StatItem } from "./stat-bar";

export type { StatItem };

const lgCols = (cols: 3 | 4 | 5) =>
  cols === 3 ? "lg:grid-cols-3" : cols === 5 ? "lg:grid-cols-5" : "lg:grid-cols-4";

// Stat metrics. Pass `items` (preferred): a compact segmented StatBar on mobile,
// StatCards at md+. Legacy `children` still renders the plain 2-up card grid
// (no mobile bar) so un-migrated pages keep working.
export function StatGrid({
  items,
  children,
  cols = 4,
}: {
  items?: StatItem[];
  children?: ReactNode;
  cols?: 3 | 4 | 5;
}) {
  if (items) {
    return (
      <>
        <div className="md:hidden">
          <StatBar items={items} />
        </div>
        <div className={cn("hidden gap-4 md:grid md:grid-cols-2", lgCols(cols))}>
          {items.map((it) => (
            <StatCard key={it.label} {...it} />
          ))}
        </div>
      </>
    );
  }
  return (
    <div className={cn("grid grid-cols-2 gap-3 sm:gap-4", lgCols(cols))}>{children}</div>
  );
}
