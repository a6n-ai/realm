import type { LucideIcon } from "lucide-react";
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";
import { Card, CardContent } from "@foundry/ui/card";
import { Skeleton } from "@foundry/ui/skeleton";
import { Badge } from "@/components/reui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@foundry/ui/cn";
import { StatBar } from "@foundry/design-system";

export type StatCardItem = {
  label: string;
  value: string | number;
  icon: LucideIcon;
  hint: string;
  /** Colors the figure for a bare good/bad number with no trend, e.g. a balance still due. */
  tone?: "ok" | "bad";
  /** Change vs the previous period. `good` says which way is good news (more cancellations is not). */
  delta?: { now: number; before: number; good: "up" | "down" };
};

// Phones get the Overview's one-row StatBar (value over label); cards from md up.
const GRID = {
  3: "hidden gap-4 md:grid md:grid-cols-3",
  4: "hidden gap-4 md:grid md:grid-cols-2 xl:grid-cols-4",
  5: "hidden gap-4 md:grid md:grid-cols-3 xl:grid-cols-5",
} as const;

// ReUI c-card-15 (stat with trend), minus its overflow menu: these cards have no actions.
// Dashboard stat rows use this instead of the @foundry/design-system StatGrid.
export function StatCards({
  items,
  cols = 5,
}: {
  items: StatCardItem[];
  cols?: 3 | 4 | 5;
}) {
  return (
    <>
      <div className="md:hidden">
        <StatBar
          items={items.map(({ label, value, tone }) => ({
            label,
            value,
            tone,
          }))}
        />
      </div>
      <div className={GRID[cols]}>
        {items.map(({ label, value, icon: Icon, hint, tone, delta }) => (
          <Card key={label}>
            <CardContent className="flex flex-col gap-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-muted-foreground min-w-0 truncate text-sm font-medium">
                  {label}
                </h3>
                <Icon
                  className="text-muted-foreground size-4 shrink-0"
                  aria-hidden="true"
                />
              </div>
              <div className="flex flex-col gap-2.5">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span
                    className={cn(
                      "text-2xl font-medium tracking-tight tabular-nums",
                      tone === "ok"
                        ? "text-success-foreground dark:text-success"
                        : tone === "bad"
                          ? "text-destructive-foreground dark:text-destructive"
                          : "text-foreground",
                    )}
                  >
                    {value}
                  </span>
                  {delta && delta.now !== delta.before ? (
                    <DeltaBadge {...delta} />
                  ) : null}
                </div>
                <Separator />
                <div className="text-muted-foreground text-xs">{hint}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}

function DeltaBadge({
  now,
  before,
  good,
}: {
  now: number;
  before: number;
  good: "up" | "down";
}) {
  const up = now > before;
  const Arrow = up ? ArrowUpIcon : ArrowDownIcon;
  return (
    <Badge
      variant={up === (good === "up") ? "success-light" : "destructive-light"}
    >
      <Arrow aria-hidden="true" />
      <span className="tabular-nums">{Math.abs(now - before)}</span>
      <span className="sr-only">
        {up ? "more" : "fewer"} than the previous period
      </span>
    </Badge>
  );
}

export function StatCardsSkeleton({
  count,
  cols = 5,
}: {
  count: number;
  cols?: 3 | 4 | 5;
}) {
  return (
    <>
      {/* The StatBar twin: one bar, N grey segments. */}
      <div className="bg-card flex divide-x overflow-hidden rounded-lg border md:hidden">
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className="flex flex-1 flex-col items-center gap-1 px-4 py-3"
          >
            <Skeleton className="h-4 w-8" />
            <Skeleton className="h-3 w-12" />
          </div>
        ))}
      </div>
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
    </>
  );
}
