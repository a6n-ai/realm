import type { LucideIcon } from "lucide-react";
import { cn } from "@realm/ui/cn";

// One metric in a StatGrid — the same shape StatCard consumes, so a page can
// pass a single `items` array and get cards (desktop) or a bar (mobile).
export type StatItem = {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  delta?: { dir: "up" | "down"; text: string };
  tone?: "ok" | "bad";
  pixelValue?: boolean;
};

// Compact mobile stats: one slim bordered bar, metrics as segments split by
// vertical rules (value over label). Scrolls horizontally when it overflows so
// 5-metric pages (or one long currency value) don't crush. Density over ornament
// — icons/hints are dropped.
//
// `min-w-fit` (not a fixed rem floor) is load-bearing: a flex item's default
// min-width is `auto` (never shrinks below its own content), and overriding
// that with a smaller fixed floor is exactly what let a wide value like
// "$16,965.60" get compressed narrower than its own text and spill past the
// segment's edge instead of the container's overflow-x-auto scroll kicking
// in as intended. `min-w-fit` restores "never smaller than my content" while
// still letting segments grow evenly via flex-1 when there's room to spare.
export function StatBar({ items }: { items: StatItem[] }) {
  return (
    <div className="bg-card flex divide-x overflow-x-auto rounded-lg border [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {items.map((it) => (
        <div key={it.label} className="flex min-w-fit flex-1 flex-col items-center gap-0.5 px-4 py-3 text-center">
          <span
            className={cn(
              "nums text-base leading-none font-semibold whitespace-nowrap",
              it.pixelValue !== false && "font-pixel-circle",
              it.tone === "ok" && "text-ok",
              it.tone === "bad" && "text-bad",
            )}
          >
            {it.value}
          </span>
          <span className="text-muted-foreground text-[11px] leading-tight whitespace-nowrap">{it.label}</span>
        </div>
      ))}
    </div>
  );
}
