import type { ReactNode } from "react";
import { cn } from "@realm/ui/cn";

// Stat metric grid: 2-up on mobile (kills the one-per-row waste), cols-up at lg.
export function StatGrid({ children, cols = 4 }: { children: ReactNode; cols?: 3 | 4 }) {
  return (
    <div className={cn("grid grid-cols-2 gap-3 sm:gap-4", cols === 3 ? "lg:grid-cols-3" : "lg:grid-cols-4")}>
      {children}
    </div>
  );
}
