import type { LucideIcon } from "lucide-react";

// One metric in a StatGrid — the same shape StatCard consumes, so a page can
// pass a single `items` array and get cards (desktop) or a bar (mobile).
export type StatItem = {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  delta?: { dir: "up" | "down"; text: string };
};

// Compact mobile stats: one slim bordered bar, metrics as segments split by
// vertical rules (value over label). Scrolls horizontally when it overflows so
// 5-metric pages don't crush. Density over ornament — icons/hints are dropped.
export function StatBar({ items }: { items: StatItem[] }) {
  return (
    <div className="bg-card flex divide-x overflow-x-auto rounded-lg border [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {items.map((it) => (
        <div key={it.label} className="flex min-w-[5rem] flex-1 flex-col items-center gap-0.5 px-3 py-2.5 text-center">
          <span className="nums text-base leading-none font-semibold">{it.value}</span>
          <span className="text-muted-foreground text-[11px] leading-tight">{it.label}</span>
        </div>
      ))}
    </div>
  );
}
