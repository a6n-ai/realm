"use client";

import Link from "next/link";
import { Pencil } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { Badge } from "@foundry/ui/badge";
import { Skeleton } from "@foundry/ui/skeleton";
import { cn } from "@foundry/ui/cn";
import { buildHomeMenuColumns, DAYS, type DayOfWeek, type PosterItem } from "@/lib/menu/poster";
import type { MealSlot } from "@/lib/menu/meal-types";
import { formatEpoch, formatMenuWeekRange } from "@/lib/format/datetime";
import { useTimezone } from "@/components/providers/timezone-provider";

type WeekStatus = "draft" | "ready" | "released";

type WeekMenu = {
  publicId: string;
  weekStart: string;
  status: string;
  releasedAt: number | null;
  itemCount: number;
  slots: MealSlot[];
  items: PosterItem[];
};

function highlightLabel(highlight: "current" | "upcoming"): string {
  switch (highlight) {
    case "current":
      return "This week";
    case "upcoming":
      return "Upcoming";
    default: {
      const _never: never = highlight;
      return _never;
    }
  }
}

function statusMeta(status: string): { label: string; variant: "default" | "secondary" | "outline" } {
  const value = status as WeekStatus;
  switch (value) {
    case "released":
      return { label: "Released", variant: "default" };
    case "ready":
      return { label: "Ready", variant: "outline" };
    case "draft":
      return { label: "Draft", variant: "secondary" };
    default: {
      const _never: never = value;
      return { label: status, variant: "secondary" };
    }
  }
}

export function MenuHistoryCard({
  week, accent, highlight = null, todayKey,
}: {
  week: WeekMenu;
  accent: string;
  highlight?: "current" | "upcoming" | null;
  todayKey?: DayOfWeek;
}) {
  const tz = useTimezone();
  const columns = buildHomeMenuColumns(week.slots, week.items);
  const status = statusMeta(week.status);

  return (
    <article
      className="overflow-hidden rounded-xl border bg-card"
      style={highlight ? { borderLeftWidth: 3, borderLeftColor: accent } : undefined}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold tracking-tight tabular-nums">
              {formatMenuWeekRange(week.weekStart)}
            </h3>
            {highlight ? (
              <span
                className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                style={{ backgroundColor: `${accent}18`, color: accent }}
              >
                {highlightLabel(highlight)}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
            {week.itemCount} {week.itemCount === 1 ? "dish" : "dishes"}
            {week.releasedAt
              ? ` · Released ${formatEpoch(week.releasedAt, { mode: "date", timeZone: tz })}`
              : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant={status.variant}>{status.label}</Badge>
          <Button asChild size="sm" variant="outline" className="gap-1.5">
            <Link href={`/dashboard/menus/${week.publicId}`}>
              <Pencil className="size-3.5" />
              Edit week
            </Link>
          </Button>
        </div>
      </header>

      <div className="flex snap-x snap-mandatory overflow-x-auto md:grid md:snap-none md:grid-cols-7 md:overflow-visible">
        {columns.map((col, index) => {
          const isToday = highlight === "current" && todayKey === DAYS[index];
          const empty = col.groups.every((g) => g.dishes.length === 0);
          return (
            <section
              key={col.label}
              aria-label={col.label}
              aria-current={isToday ? "date" : undefined}
              className={cn(
                "min-w-[8.5rem] snap-start px-3 py-3 md:min-w-0",
                index < columns.length - 1 && "border-r",
                isToday && "bg-primary/[0.04]",
              )}
            >
              <p
                className={cn(
                  "border-b pb-1.5 text-[11px] font-semibold tracking-wide",
                  isToday ? "border-primary/40 text-foreground" : "border-border text-muted-foreground",
                )}
              >
                {col.label}
              </p>
              {empty ? null : (
                <div className="mt-2.5 space-y-3">
                  {col.groups.map((g, gi) => (
                    <div key={g.slotLabel ?? gi} className="space-y-0.5">
                      {g.slotLabel ? (
                        <p className="text-[11px] font-medium text-muted-foreground">{g.slotLabel}</p>
                      ) : null}
                      {g.dishes.map((d, i) => (
                        <p key={`${d.name}-${i}`} className="text-sm leading-snug text-pretty">
                          {d.name}
                        </p>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </article>
  );
}

export function MenuHistoryCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex items-start justify-between gap-3 border-b px-4 py-3 sm:px-5">
        <div className="space-y-1.5">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-3 w-24" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-8 w-24" />
        </div>
      </div>
      <div className="flex md:grid md:grid-cols-7">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className={cn("min-w-[8.5rem] space-y-2 px-3 py-3 md:min-w-0", i < 6 && "border-r")}>
            <Skeleton className="h-3 w-8" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
