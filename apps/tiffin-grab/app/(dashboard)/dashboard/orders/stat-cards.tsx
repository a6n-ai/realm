import type { LucideIcon } from "lucide-react";
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";
import { Card, CardContent } from "@foundry/ui/card";
import { Skeleton } from "@foundry/ui/skeleton";
import { Badge } from "@/components/reui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@foundry/ui/cn";

export type OrdersStat = {
  label: string;
  value: string | number;
  icon: LucideIcon;
  hint: string;
  /** Colors the figure for a bare good/bad number with no trend, e.g. a balance still due. */
  tone?: "ok" | "bad";
  /** Change vs the previous period. `good` says which way is good news (more cancellations is not). */
  delta?: { now: number; before: number; good: "up" | "down" };
};

const GRID = {
  4: "grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4",
  5: "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5",
} as const;

// ReUI c-card-15 (stat with trend), minus its overflow menu: these cards have no actions.
export function OrdersStatCards({ items, cols = 5 }: { items: OrdersStat[]; cols?: 4 | 5 }) {
  return (
    <div className={GRID[cols]}>
      {items.map(({ label, value, icon: Icon, hint, tone, delta }) => (
        <Card key={label}>
          <CardContent className="flex flex-col gap-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-muted-foreground text-sm font-medium">{label}</h3>
              <Icon className="text-muted-foreground size-4" aria-hidden="true" />
            </div>
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center gap-2.5">
                <span className={cn("text-2xl font-medium tracking-tight tabular-nums", tone === "ok" ? "text-success-foreground dark:text-success" : tone === "bad" ? "text-destructive-foreground dark:text-destructive" : "text-foreground")}>{value}</span>
                {delta && delta.now !== delta.before ? <DeltaBadge {...delta} /> : null}
              </div>
              <Separator />
              <div className="text-muted-foreground text-xs">{hint}</div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function DeltaBadge({ now, before, good }: { now: number; before: number; good: "up" | "down" }) {
  const up = now > before;
  const Arrow = up ? ArrowUpIcon : ArrowDownIcon;
  return (
    <Badge variant={up === (good === "up") ? "success-light" : "destructive-light"}>
      <Arrow aria-hidden="true" />
      <span className="tabular-nums">{Math.abs(now - before)}</span>
      <span className="sr-only">{up ? "more" : "fewer"} than the previous period</span>
    </Badge>
  );
}

export function OrdersStatCardsSkeleton({ count, cols = 5 }: { count: number; cols?: 4 | 5 }) {
  return (
    <div className={GRID[cols]}>
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i}>
          <CardContent className="flex flex-col gap-5">
            <Skeleton className="h-5 w-24" />
            <div className="flex flex-col gap-2.5">
              <Skeleton className="h-8 w-16" />
              <Separator />
              <Skeleton className="h-4 w-40" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
