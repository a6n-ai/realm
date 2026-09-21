import type { ReactNode } from "react";
import { cn, FONT } from "./cn";

export function StatTile({ label, value, unit, hint, className }: { label: string; value: ReactNode; unit?: string; hint?: string; className?: string }) {
  return (
    <div className={cn(FONT, "rounded-[20px] border border-[var(--border)] bg-[var(--card)] p-4", className)}>
      <p className="c-label">{label}</p>
      <p className="mt-2 leading-none">
        <span className="c-stat text-[var(--primary)]">{value}</span>
        {unit && <span className="ml-1 text-sm font-medium text-[var(--muted-foreground)]">{unit}</span>}
      </p>
      {hint && <p className="c-caption mt-2">{hint}</p>}
    </div>
  );
}
