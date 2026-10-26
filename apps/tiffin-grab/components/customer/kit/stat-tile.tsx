import type { ReactNode } from "react";
import { cn, FONT } from "./cn";

/** A number with its label. Tiles in a row share one shape: icon, value, label, hint — so they line up. */
export function StatTile({ label, value, unit, hint, icon, className }: { label: string; value: ReactNode; unit?: string; hint?: string; icon?: ReactNode; className?: string }) {
  return (
    <div className={cn(FONT, "c-surface flex h-full flex-col gap-3 rounded-[20px] bg-[var(--card)] p-4", className)}>
      {icon}
      <div className="mt-auto space-y-1">
        <p className="leading-none">
          <span className="c-stat">{value}</span>
          {unit && <span className="ml-1 text-sm font-medium text-[var(--muted-foreground)]">{unit}</span>}
        </p>
        <p className="text-[15px] font-semibold">{label}</p>
        {hint && <p className="c-caption">{hint}</p>}
      </div>
    </div>
  );
}
