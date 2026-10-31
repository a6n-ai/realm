import { Fragment, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
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
  icon?: LucideIcon;
  hint?: string;
  /** Colors the figure for a bare good/bad number with no trend, e.g. a balance still due. */
  tone?: "ok" | "bad" | "warn";
  /** Makes the whole card a link to the rows behind the number. */
  href?: string;
  /** Short state pill in the icon slot. */
  badge?: string;
  badgeTone?: "neutral" | "ok" | "warn" | "brand" | "primary";
  /** A second fact under the hint, usually a `StatFootnote`. */
  footer?: ReactNode;
  /** A name (a dish title) should not use the figure size. */
  valueSize?: "label";
  /** Change vs the previous period. `good` says which way is good news (more cancellations is not). */
  delta?: { now: number; before: number; good: "up" | "down" };
};

// Phones get the Overview's one-row StatBar (value over label); cards from md up.
const GRID = {
  3: "hidden gap-4 md:grid md:grid-cols-3",
  4: "hidden gap-4 md:grid md:grid-cols-2 xl:grid-cols-4",
  5: "hidden gap-4 md:grid md:grid-cols-3 xl:grid-cols-5",
} as const;

const BADGE = {
  neutral: "secondary",
  ok: "success-light",
  warn: "warning-light",
  brand: "primary-light",
  primary: "default",
} as const;

/** Soft bar under a card's hint, for a second fact such as a rate or a total. */
export function StatFootnote({ children }: { children: ReactNode }) {
  return (
    <div className="bg-muted/60 flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs">
      {children}
    </div>
  );
}

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
            tone: tone === "warn" ? undefined : tone,
          }))}
        />
      </div>
      <div className={GRID[cols]}>
        {items.map(
          ({ label, value, icon: Icon, hint, tone, delta, href, badge, badgeTone, footer, valueSize }) => {
            const card = (
              <Card className={href ? "h-full" : undefined}>
                <CardContent className="flex flex-col gap-5">
                  <div className="flex items-center justify-between gap-3">
                    <h3
                      className={cn(
                        "text-muted-foreground min-w-0 truncate text-sm font-medium",
                        href && "group-hover/stat:text-foreground transition-colors",
                      )}
                    >
                      {label}
                    </h3>
                    {badge ? (
                      <Badge variant={BADGE[badgeTone ?? "neutral"]}>{badge}</Badge>
                    ) : Icon ? (
                      <Icon className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
                    ) : null}
                  </div>
                  <div className="flex flex-col gap-2.5">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span
                        className={cn(
                          valueSize === "label" ? "text-lg font-medium" : "text-2xl font-medium",
                          "tracking-tight tabular-nums",
                          tone === "ok"
                            ? "text-success-foreground dark:text-success"
                            : tone === "bad"
                              ? "text-destructive-foreground dark:text-destructive"
                              : tone === "warn"
                                ? "text-warning-foreground dark:text-warning"
                                : "text-foreground",
                        )}
                      >
                        {value}
                      </span>
                      {delta && delta.now !== delta.before ? <DeltaBadge {...delta} /> : null}
                    </div>
                    {hint || footer ? <Separator /> : null}
                    {hint ? <div className="text-muted-foreground text-xs">{hint}</div> : null}
                    {footer}
                  </div>
                </CardContent>
              </Card>
            );
            return href ? (
              <Link
                key={label}
                href={href}
                className="group/stat focus-visible:ring-ring block h-full rounded-xl outline-none focus-visible:ring-2"
              >
                {card}
              </Link>
            ) : (
              <Fragment key={label}>{card}</Fragment>
            );
          },
        )}
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
